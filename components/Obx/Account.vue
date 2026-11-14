<template>
  <section ref="card" class="obx-card" :data-tone="split || (view && !view.Connected) ? 'crit' : undefined" :data-flash="flash || undefined" aria-label="Roblox account" data-testid="obx-account">
    <header class="obx-card__head">
      <h2 class="obx-card__title"><ObxIcon name="user" />Roblox account</h2>
      <span class="obx-card__meta">{{ headline }}</span>
      <div class="obx-card__tools">
        <button v-if="view?.Connected" class="obx-btn obx-btn--sm obx-btn--ghost" :disabled="busy" @click="act('/omniblox/roblox/verify')"><ObxIcon name="refresh" />Check</button>
      </div>
    </header>
    <div class="obx-card__body">
      <div v-if="error && !view" class="obx-banner" data-tone="crit"><ObxIcon class="obx-banner__glyph" name="octagon" /><div class="obx-banner__text"><strong>Could not load the account</strong><span>{{ error }}</span></div></div>
      <div v-else-if="!view" class="obx-skel" style="height: 72px"></div>

      <div v-else class="obx-account">
        <!-- The three that must be one account. -->
        <div class="obx-account__compare" data-testid="obx-account-compare">
          <div :data-tone="split ? 'crit' : 'ok'">
            <small>Games belong to</small>
            <b>{{ view.CreatorGroupId ? `group ${view.CreatorGroupId}` : view.CreatorUserId ? `user ${view.CreatorUserId}` : 'not set' }}</b>
          </div>
          <div :data-tone="!view.Account ? 'warn' : split && split.session && split.session.id !== split.creator ? 'crit' : 'ok'">
            <small>Signed in as</small>
            <b>{{ view.Account ? `${view.Account.Name}` : view.Connected ? 'a pasted session' : 'nobody' }}</b>
            <span v-if="view.Account" class="obx-dim obx-mono" style="font-size: 11px">#{{ view.Account.UserId }}</span>
          </div>
          <div :data-tone="!view.ApiKey?.Set ? 'warn' : view.ApiKey.MatchesAccount === false ? 'crit' : 'ok'">
            <small>API key</small>
            <b>{{ view.ApiKey?.Info ? `“${view.ApiKey.Info.Name}”` : view.ApiKey?.Set ? 'set' : 'not set' }}</b>
            <span v-if="view.ApiKey?.Info" class="obx-dim obx-mono" style="font-size: 11px">user {{ view.ApiKey.Info.OwnerUserId }}</span>
          </div>
        </div>

        <div v-if="split" class="obx-banner" data-tone="crit" role="alert" data-testid="obx-account-split">
          <ObxIcon class="obx-banner__glyph" name="octagon" />
          <div class="obx-banner__text">
            <strong>Roblox refuses every upload until these are one account</strong>
            <span>The games are user {{ split.creator }}'s; the {{ split.session && split.session.id !== split.creator ? `session is ${split.session.name} (user ${split.session.id})` : 'session matches' }}{{ split.key && split.key.id !== split.creator ? ` and the key was made on user ${split.key.id}` : '' }}. Either move the studio to {{ split.session?.name ?? 'the signed-in account' }} (confirm a Quick Log In code as that account, then its games get new experiences there), or set a key and session of user {{ split.creator }}.</span>
          </div>
          <div class="obx-banner__actions">
            <button class="obx-btn obx-btn--sm obx-btn--primary" :disabled="busy" data-testid="obx-account-switch" @click="switchAccount">Move the studio to {{ split.session?.name ?? 'this account' }}</button>
          </div>
        </div>

        <!-- Connected -->
        <div v-if="view.Connected" class="obx-account__row">
          <span class="obx-account__avatar" data-tone="ok">{{ (view.Account?.Name ?? 'R').slice(0, 1).toUpperCase() }}</span>
          <span class="obx-account__who">
            <template v-if="view.Account">
              <b>{{ view.Account.Name }}</b>
              <small>{{ view.Account.Method === 'quick-login' ? 'Quick Log In' : 'pasted cookie' }} · since {{ obxAgo(view.Account.ConnectedUtc, now) }}<template v-if="view.Account.VerifiedUtc"> · checked {{ obxAgo(view.Account.VerifiedUtc, now) }}</template></small>
            </template>
            <template v-else><b>A session is set</b><small>Check it to see whose it is.</small></template>
          </span>
          <button class="obx-btn obx-btn--sm obx-btn--ghost" :disabled="busy" @click="disconnect">Disconnect</button>
        </div>

        <!-- A code waiting for the owner -->
        <div v-else-if="view.Pending" class="obx-stack" style="gap: 10px" aria-live="polite">
          <div class="obx-account__row">
            <span class="obx-code-big" aria-label="Quick Log In code" data-testid="obx-account-code">{{ view.Pending.Code }}</span>
            <button class="obx-btn obx-btn--sm obx-btn--ghost" type="button" @click="copyCode"><ObxIcon name="copy" />{{ copied ? 'Copied' : 'Copy' }}</button>
            <span class="obx-dim">{{ remaining }}</span>
          </div>
          <ol class="obx-list" style="list-style: decimal !important">
            <li>On a device signed in to Roblox <b>as the account that owns the experiences</b>, on the <b>same network as the server</b>, open <a class="obx-link" :href="view.Pending.ConfirmUrl" target="_blank" rel="noopener">Quick Log In ↗</a>.</li>
            <li>Enter the code, then press <b>Confirm Login</b>.</li>
          </ol>
          <p class="obx-account__row" :style="{ color: view.Pending.State === 'UserLinked' ? 'var(--obx-accent)' : 'var(--obx-ink-2)' }">
            <span class="obx-dot" data-tone="info" data-pulse="true"></span>{{ pendingLine }}
          </p>
          <div class="obx-account__row">
            <button class="obx-btn obx-btn--sm obx-btn--ghost" :disabled="busy" @click="act('/omniblox/roblox/quicklogin/cancel')">Cancel</button>
            <button class="obx-btn obx-btn--sm obx-btn--ghost" :disabled="busy" @click="connect">New code</button>
          </div>
        </div>

        <!-- Not connected -->
        <div v-else class="obx-stack" style="gap: 10px">
          <p class="obx-ink2">Roblox has no API key for an experience's icon, its maturity questionnaire or creating experiences, so the studio acts as your account for those. <b>Without the questionnaire Roblox lets nobody play a public game.</b> Quick Log In signs it in with a code you confirm on Roblox; no password is typed here.</p>
          <ul v-if="view.Waiting?.length" class="obx-list"><li v-for="w in view.Waiting" :key="w">{{ w }}</li></ul>
          <div class="obx-account__row">
            <button class="obx-btn obx-btn--primary" :disabled="busy" data-testid="obx-account-connect" @click="connect">Connect with Quick Log In</button>
          </div>
          <details>
            <summary class="obx-dim">Or paste a session cookie</summary>
            <p class="obx-dim" style="margin: 8px 0">The <code class="obx-mono">.ROBLOSECURITY</code> cookie of the account that owns the experiences. Roblox checks it before it is kept; it is never shown again and stays out of the request logs.</p>
            <form class="obx-form" @submit.prevent="paste">
              <input v-model="cookie" class="obx-input obx-mono" type="password" autocomplete="off" spellcheck="false" placeholder=".ROBLOSECURITY value" aria-label="Roblox session cookie" />
              <button class="obx-btn obx-btn--sm" :disabled="busy || !cookie.trim()">Check and save</button>
            </form>
          </details>
        </div>

        <p v-if="view.LastError" class="obx-banner" data-tone="crit" role="alert"><ObxIcon class="obx-banner__glyph" name="alert" /><span class="obx-banner__text"><span>{{ view.LastError }}</span></span></p>

        <!-- Games still on the account the studio switched away from. -->
        <div v-if="view.OldAccountGames?.length">
          <h3 class="obx-sub">Still on the old account</h3>
          <ul class="obx-stack" style="gap: 6px">
            <li v-for="g in view.OldAccountGames" :key="g.GameId" class="obx-account__row">
              <NuxtLink class="obx-link" :to="`/schemery/omniblox/game/${g.GameId}`">{{ g.Title }}</NuxtLink>
              <span class="obx-dim">{{ g.Stage }} · experience {{ g.UniverseId }}</span>
              <button class="obx-btn obx-btn--xs" :disabled="busy || moving === g.GameId" @click="moveGame(g.GameId, g.Title)">Move to this account</button>
            </li>
          </ul>
        </div>

        <!-- The Open Cloud API key, and moving the studio to another account. -->
        <div class="obx-account__row" style="border-top: 1px solid var(--obx-line); padding-top: 10px">
          <span class="obx-dim" style="font-size: 11.5px">Key: {{ view.ApiKey?.Info ? `“${view.ApiKey.Info.Name}”${view.ApiKey.Info.ExpiresUtc ? ` · expires ${obxAgo(view.ApiKey.Info.ExpiresUtc, now)}` : ''}` : view.ApiKey?.Set ? 'set in OmniSettings' : 'not set' }}</span>
          <span style="flex: 1"></span>
          <button class="obx-btn obx-btn--xs obx-btn--ghost" :aria-expanded="keyOpen" @click="keyOpen = !keyOpen">{{ view.ApiKey?.Set ? 'Change key' : 'Set key' }}</button>
          <button v-if="view.Connected && !split" class="obx-btn obx-btn--xs obx-btn--ghost" :disabled="busy" @click="switchAccount">Switch account</button>
        </div>
        <form v-if="keyOpen" class="obx-form" @submit.prevent="saveKey">
          <input v-model="apiKey" class="obx-input obx-mono" type="password" autocomplete="off" spellcheck="false" placeholder="Open Cloud API key" aria-label="Roblox Open Cloud API key" />
          <button class="obx-btn obx-btn--sm" :disabled="busy || !apiKey.trim()">Check and save</button>
          <p class="obx-dim" style="flex-basis: 100%; font-size: 11.5px">Roblox checks the key first (enabled, not expired, usable from the server, the studio account's own). It is never shown again.</p>
        </form>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { bloxPost } from '~/composables/useOmniBlox';
import { obxConfirm, obxToast, useObxRoblox } from '~/composables/useObxConsole';
import { obxAccountSplit, obxAgo } from '~/scripts/omniblox/console';

/** The Roblox account the studio acts as, and whether its games, session and key are one account. */
const props = defineProps<{ now: number }>();
const emit = defineEmits<{ changed: [] }>();

const { view, error, load, act: post } = useObxRoblox();
const busy = ref(false);
const cookie = ref('');
const apiKey = ref('');
const keyOpen = ref(false);
const copied = ref(false);
const moving = ref<string | null>(null);
const card = ref<HTMLElement | null>(null);
const flash = ref(false);

const split = computed(() => obxAccountSplit(view.value));
const headline = computed(() => {
  const v = view.value;
  if (!v) return '';
  if (split.value) return 'split across accounts';
  if (v.Pending) return 'waiting for the code';
  return v.Connected ? 'connected' : 'not connected';
});

async function act(path: string, body: unknown = {}) {
  busy.value = true;
  try {
    const was = view.value?.Connected ?? false;
    const next = await post(path, body);
    if (next && next.Connected !== was) emit('changed');
    return next;
  } finally {
    busy.value = false;
  }
}

async function connect() { copied.value = false; await act('/omniblox/roblox/quicklogin'); }
async function paste() { await act('/omniblox/roblox/cookie', { cookie: cookie.value.trim() }); cookie.value = ''; }
async function saveKey() {
  const next = await act('/omniblox/roblox/apikey', { apiKey: apiKey.value.trim() });
  apiKey.value = '';
  if (next && !next.LastError) { keyOpen.value = false; obxToast('API key saved', next.ApiKey?.Info ? `“${next.ApiKey.Info.Name}” on user ${next.ApiKey.Info.OwnerUserId}` : ''); }
}
async function disconnect() {
  const quick = view.value?.Account?.Method === 'quick-login';
  if (!await obxConfirm('Disconnect the Roblox account?', quick
    ? 'The studio signs its own session out. Icons, the maturity questionnaire and new experiences wait until you connect again.'
    : 'Your browser stays signed in. Icons, the maturity questionnaire and new experiences wait until you connect again.', 'Disconnect', true)) return;
  await act('/omniblox/roblox/disconnect');
}
async function switchAccount() {
  if (!await obxConfirm('Switch the studio to another Roblox account?',
    'Confirm the code with the other account. It becomes the studio\'s account: new games are published there, the current account\'s experiences are not used again, and games already published are listed here to move. Set that account\'s API key too.',
    'Switch')) return;
  copied.value = false;
  await act('/omniblox/roblox/quicklogin', { switchAccount: true });
}
async function moveGame(gameId: string, title: string) {
  if (!await obxConfirm(`Move "${title}" to this account?`, 'The studio creates a new experience on this account and relaunches the game there; the old experience is made private and never used again.', 'Move it')) return;
  moving.value = gameId;
  try {
    const result = await bloxPost<{ ok: boolean; started: string }>('/omniblox/games/action', { gameId, action: 'move', target: 'new' });
    if (!result.ok) obxToast('Not moved', result.error ?? '', 'warn');
    else { obxToast('Moving', `${result.data?.started ?? title}: follow it on the game's page.`, 'info'); await load(true); }
  } finally {
    moving.value = null;
  }
}
async function copyCode() {
  if (!view.value?.Pending) return;
  try { await navigator.clipboard.writeText(view.value.Pending.Code); copied.value = true; } catch { /* the code is on screen */ }
}

/** Brings the card into view and starts Quick Log In when nothing is connected (the inbox's "Fix the account"). */
async function start() {
  card.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  flash.value = false;
  requestAnimationFrame(() => { flash.value = true; });
  setTimeout(() => { flash.value = false; }, 1500);
  if (view.value && !view.value.Connected && !view.value.Pending) await connect();
}
defineExpose({ start });

// ── the code's countdown, and Roblox asked about it every 3 s while it waits ──
const clock = ref(Date.now());
const remaining = computed(() => {
  const p = view.value?.Pending;
  if (!p) return '';
  const seconds = Math.max(0, Math.round((Date.parse(p.ExpiresUtc) - clock.value) / 1000));
  return seconds > 0 ? `expires in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'expired';
});
const pendingLine = computed(() => {
  const p = view.value?.Pending;
  if (!p) return '';
  if (p.State === 'UserLinked') return `${p.AccountName ?? 'Someone'} entered the code: press Confirm Login on that device.`;
  if (p.State === 'Validated') return 'Confirmed: signing the studio in…';
  return 'Waiting for the code to be entered…';
});
let timer: ReturnType<typeof setInterval> | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
let polling = false;
async function poll() {
  if (polling || busy.value || !view.value?.Pending) return;
  polling = true;
  try {
    const was = view.value?.Connected ?? false;
    const result = await bloxPost<typeof view.value>('/omniblox/roblox/quicklogin/poll');
    if (result.ok && result.data) {
      view.value = result.data;
      if (result.data.Connected && !was) { obxToast('Roblox account connected', result.data.Account?.Name ?? ''); emit('changed'); }
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
}, { immediate: true });

onMounted(() => { void load(true); });
onBeforeUnmount(stopTimers);
</script>
