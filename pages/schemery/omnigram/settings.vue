<template>
    <OmniGramShell @refresh="load">
        <div class="ot-pagehead">
            <div>
                <h1>Settings</h1>
                <p class="subtitle">The Instagram app, connected accounts, the public media link Instagram downloads from, and the engine.</p>
            </div>
            <div v-if="canManage" class="ot-actions">
                <button class="ot-btn primary" @click="openWizard(null)">Connect an account</button>
            </div>
        </div>

        <div v-if="!settings && loading" class="ot-skelrows"><div class="ot-skel" style="height:200px"></div></div>
        <OmniTraderStateBlock v-else-if="!settings && error" kind="error" title="Could not load settings" :detail="error" />

        <template v-else-if="settings">
            <div v-if="engine.V1PasswordFilesPresent" id="legacy" class="ot-banner warn" role="alert">
                <span class="glyph">!</span>
                <div>
                    <strong>OmniGram v1 left Instagram passwords on the server in plain text.</strong>
                    v1 logged in with each account's password and kept it unencrypted under SavedData/OmniGram/Accounts, with its login sessions.
                    v2 never uses them. Remove them once you have the passwords somewhere safe; account settings and history are not affected.
                </div>
                <div v-if="canManage" class="actions"><button class="ot-btn sm danger" :disabled="busy" @click="removeV1Passwords">Remove v1 passwords</button></div>
            </div>

            <div class="ot-grid two">
                <!-- Instagram app -->
                <OmniTraderCard id="app" title="Instagram app" subtitle="The Meta app accounts sign in through (Instagram API with Instagram Login). The secret is stored encrypted.">
                    <template #controls>
                        <span class="ot-chip" :class="settings.App.Configured ? (settings.App.LastVerifyError ? 'warn' : settings.App.VerifiedUtc ? 'ok' : 'info') : 'bad'">
                            {{ settings.App.Configured ? (settings.App.LastVerifyError ? 'Login failing' : settings.App.VerifiedUtc ? 'Verified' : 'Saved, unverified') : 'Not set up' }}
                        </span>
                    </template>
                    <dl class="ot-kv">
                        <dt>Instagram app ID</dt><dd class="mono">{{ settings.App.AppId ?? 'not set' }}</dd>
                        <dt>Verified</dt><dd>{{ settings.App.VerifiedUtc ? `by a login ${fmtRelative(settings.App.VerifiedUtc, now)}` : 'not yet (the next Instagram login confirms it)' }}</dd>
                        <dt>Redirect URL</dt>
                        <dd class="copyrow"><span class="mono">{{ settings.App.RedirectUrl }}</span>
                            <button type="button" class="ot-btn sm ghost" @click="copy(settings.App.RedirectUrl)">{{ copied ? 'Copied' : 'Copy' }}</button></dd>
                        <dt>Permissions asked</dt><dd class="mono small-dd">{{ settings.Scopes.join(', ') }}</dd>
                    </dl>
                    <p v-if="settings.App.LastVerifyError" class="neg small">{{ settings.App.LastVerifyError }}</p>
                    <details class="guide">
                        <summary>How to set up the app</summary>
                        <ol>
                            <li>At <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer">developers.facebook.com/apps</a>, create an app with the Instagram use case (“Manage messaging &amp; content on Instagram”).</li>
                            <li>Open <em>API setup with Instagram business login</em>. Under <em>Set up Instagram business login → Business login settings</em>, add the redirect URL above as an OAuth redirect URI.</li>
                            <li>Copy the <em>Instagram app ID</em> and <em>Instagram app secret</em> from that page into the form below.</li>
                            <li>While the app is unpublished, add each Instagram account under <em>App roles → Instagram testers</em> and accept the invite from that account.</li>
                            <li>The accounts must be professional (Creator or Business). No Facebook Page is needed.</li>
                        </ol>
                        <p>Alternatively, generate a token per account under <em>Generate access tokens</em> and use “Paste an access token” when connecting; that needs no app secret here.</p>
                    </details>

                    <form v-if="canManage" class="appform" @submit.prevent="saveApp">
                        <div class="ot-formgrid wide">
                            <div class="ot-field">
                                <label for="ig-s-appid">Instagram app ID</label>
                                <input id="ig-s-appid" v-model="app.appId" class="ot-input mono" inputmode="numeric" autocomplete="off" :placeholder="settings.App.Configured ? 'leave blank to keep' : ''" />
                            </div>
                            <div class="ot-field">
                                <label for="ig-s-secret">Instagram app secret</label>
                                <input id="ig-s-secret" v-model="app.appSecret" class="ot-input mono" type="password" autocomplete="off" :placeholder="settings.App.Configured ? 'leave blank to keep' : ''" />
                            </div>
                            <div class="ot-field fullrow">
                                <label for="ig-s-redirect">Redirect URL</label>
                                <input id="ig-s-redirect" v-model="app.redirectUrl" class="ot-input mono" />
                            </div>
                        </div>
                        <button class="ot-btn" :disabled="savingApp">{{ savingApp ? 'Saving…' : 'Save app settings' }}</button>
                    </form>
                </OmniTraderCard>

                <!-- Public media URL -->
                <OmniTraderCard id="public-media" title="Public media link" subtitle="Instagram publishes by downloading each photo and video from this server, through short-lived signed links.">
                    <template #controls>
                        <span class="ot-chip" :class="publicTone">{{ publicLabel }}</span>
                    </template>
                    <dl class="ot-kv">
                        <dt>Base URL</dt><dd class="mono">{{ engine.PublicMedia.BaseUrl ?? '—' }}</dd>
                        <dt>Route</dt><dd class="mono">{{ settings.PublicMediaRoute }}</dd>
                        <dt>Last check</dt>
                        <dd v-if="check">
                            <span :class="check.Ok ? 'pos' : 'neg'">{{ check.Ok ? 'reachable' : 'failed' }}</span>
                            · {{ fmtRelative(check.Utc, now) }}{{ check.Status ? ` · HTTP ${check.Status}` : '' }}{{ check.LatencyMs != null ? ` · ${check.LatencyMs} ms` : '' }}
                            <span v-if="check.Detail" class="sub">{{ check.Detail }}</span>
                        </dd>
                        <dd v-else>not checked yet (checked every 6 hours)</dd>
                        <dt>Instagram fetched</dt>
                        <dd>{{ engine.PublicMedia.LastExternalMediaFetchUtc ? `${fmtRelative(engine.PublicMedia.LastExternalMediaFetchUtc, now)}${engine.PublicMedia.LastExternalMediaFetchAgent ? ` (${engine.PublicMedia.LastExternalMediaFetchAgent})` : ''}` : 'not yet' }}</dd>
                    </dl>
                    <p class="muted small">
                        Links expire after a few hours and only serve the prepared copy of a pending post. If the API is not reachable at the base URL above,
                        set the OmniSetting <code>OmniGram_PublicBaseUrl</code> to the public https address of KliveAPI.
                        A real download by Instagram (“Instagram fetched”) is the strongest proof it works.
                    </p>
                    <button v-if="canManage" class="ot-btn sm" :disabled="checking" @click="checkPublicUrl">{{ checking ? 'Checking…' : 'Check now' }}</button>
                </OmniTraderCard>
            </div>

            <!-- Accounts -->
            <h2 class="ot-sectionhead">Instagram accounts</h2>
            <div v-if="!settings.Accounts.length" class="ot-card"><div class="body">
                <OmniTraderStateBlock title="No accounts connected" detail="Connect a Creator or Business account to start.">
                    <button v-if="canManage" class="ot-btn primary" @click="openWizard(null)">Connect an account</button>
                </OmniTraderStateBlock>
            </div></div>
            <OmniTraderCard v-else flush>
                <div class="ot-tablewrap">
                    <table class="ot-table">
                        <thead><tr><th>Account</th><th>Connection</th><th>Token</th><th>API posts (24 h)</th><th></th></tr></thead>
                        <tbody>
                            <tr v-for="a in settings.Accounts" :key="a.AccountId">
                                <td>
                                    <div class="acct">
                                        <OmniTumblrAvatar :src="a.ProfilePictureUrl" :name="a.Username" :size="28" round />
                                        <div class="acctmain">
                                            <NuxtLink :to="`/schemery/omnigram/account/${a.AccountId}`">@{{ a.Username }}</NuxtLink>
                                            <span class="sub">{{ typeLabel(a.AccountType) }}{{ a.Imported ? ' · from v1' : '' }}</span>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <span class="ot-chip" :class="connectionTone(a.Connection)">{{ CONNECTION_LABEL[a.Connection] }}</span>
                                    <span v-if="a.ConnectionDetail" class="sub">{{ a.ConnectionDetail }}</span>
                                    <span v-else-if="a.ConnectedUtc" class="sub">via {{ a.ConnectedVia === 'oauth' ? 'Instagram login' : 'token' }} · {{ fmtDate(a.ConnectedUtc) }}</span>
                                </td>
                                <td class="nowrap">
                                    <template v-if="a.TokenExpiresUtc">
                                        <span :class="tokenTone(a.TokenExpiresUtc)">expires {{ fmtDate(a.TokenExpiresUtc) }}</span>
                                        <span class="sub">{{ a.TokenRefreshedUtc ? `renewed ${fmtRelative(a.TokenRefreshedUtc, now)}` : `issued ${fmtRelative(a.TokenIssuedUtc, now)}` }}</span>
                                    </template>
                                    <span v-else class="muted">—</span>
                                </td>
                                <td class="nowrap">{{ a.Quota.QuotaTotal ? `${a.Quota.QuotaUsage ?? 0} of ${a.Quota.QuotaTotal}` : '—' }}</td>
                                <td class="rowacts">
                                    <template v-if="canManage">
                                        <button class="ot-btn sm" @click="openWizard(a.AccountId)">{{ a.Connected ? 'Reconnect' : 'Connect' }}</button>
                                        <button v-if="a.Connected" class="ot-btn sm ghost" :disabled="busy" @click="renewToken(a.AccountId)">Renew token</button>
                                    </template>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </OmniTraderCard>

            <!-- Engine -->
            <h2 class="ot-sectionhead">Engine</h2>
            <div class="ot-grid two">
                <OmniTraderCard title="Loops" subtitle="Publish (every few seconds when due), plan (≈45 s) and sync (≈60 s).">
                    <template #controls>
                        <span class="ot-chip" :class="engine.Running && engine.PublishingEnabled ? 'ok' : 'warn'">
                            {{ !engine.Enabled ? 'Disabled' : !engine.Running ? engine.StartupState : engine.PublishingEnabled ? 'Running' : 'Publishing off' }}
                        </span>
                    </template>
                    <div class="ot-tablewrap">
                        <table class="ot-table">
                            <thead><tr><th>Loop</th><th>State</th><th>Last run</th><th>Last did</th></tr></thead>
                            <tbody>
                                <tr v-for="l in engine.Loops" :key="l.Name">
                                    <td>{{ l.Name }}</td>
                                    <td><span class="ot-chip" :class="l.LastError && l.LastErrorUtc && (!l.LastTickUtc || l.LastErrorUtc > l.LastTickUtc) ? 'bad' : ''">{{ l.State }}</span></td>
                                    <td class="nowrap">{{ fmtRelative(l.LastTickUtc, now) }}</td>
                                    <td>{{ l.LastActivity ? `${l.LastActivity} (${fmtRelative(l.LastActivityUtc, now)})` : '—' }}
                                        <span v-if="l.LastError" class="sub neg">{{ l.LastError }}</span></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <dl class="ot-kv">
                        <dt>MemeScraper</dt><dd :class="engine.MemeScraperReady ? 'pos' : 'neg'">{{ engine.MemeScraperReady ? 'ready' : 'not loaded' }}</dd>
                        <dt>AI captions</dt><dd :class="engine.AiAvailable ? 'pos' : 'neg'">{{ engine.AiAvailable ? 'KliveLLM available' : 'KliveLLM not running' }}</dd>
                        <dt>FFmpeg</dt>
                        <dd :class="engine.Ffmpeg?.Available === false ? 'neg' : engine.Ffmpeg?.Available ? 'pos' : ''">
                            {{ engine.Ffmpeg?.Available == null ? 'not checked yet' : engine.Ffmpeg.Status }}
                        </dd>
                        <dt>Kill switches</dt><dd>OmniSettings <code>OmniGram_Enabled</code> (whole engine) and <code>OmniGramV2_PublishingEnabled</code> (publishing only)</dd>
                        <template v-if="engine.Migration"><dt>v1 import</dt><dd>{{ engine.Migration }}</dd></template>
                    </dl>
                    <div v-if="engine.SyncErrors?.length" class="syncerrors">
                        <h4 class="ot-sectionhead">Sync problems</h4>
                        <ul>
                            <li v-for="e in engine.SyncErrors" :key="e.Job"><span class="mono">{{ e.Job }}</span> — {{ e.Error }}</li>
                        </ul>
                    </div>
                </OmniTraderCard>

                <OmniTraderCard title="Instagram API" :subtitle="`Graph API ${engine.Api.Version ?? '—'}${engine.Api.ProxyActive ? ' · through the OmniGram_Proxy' : ''}`">
                    <div class="meters">
                        <OmniTraderMeter label="App rate limit used" :value="engine.Api.AppUsagePercent != null ? `${engine.Api.AppUsagePercent}%` : 'not reported'" limit="of Meta's hourly allowance"
                                         :percent="engine.Api.AppUsagePercent" :warn-at="70" />
                        <OmniTraderMeter label="Busiest account's limit used" :value="engine.Api.AccountUsagePercent != null ? `${engine.Api.AccountUsagePercent}%` : 'not reported'" limit="of its allowance"
                                         :percent="engine.Api.AccountUsagePercent" :warn-at="70" />
                    </div>
                    <p v-if="engine.Api.RegainAccessMinutes" class="neg small">Instagram is throttling: access returns in about {{ engine.Api.RegainAccessMinutes }} min. Background syncing pauses until then; publishing continues.</p>
                    <dl class="ot-kv">
                        <dt>Calls</dt><dd>{{ engine.Api.CallsThisHour }} this hour · {{ engine.Api.CallsToday }} today</dd>
                        <template v-if="engine.Api.UsageObservedUtc"><dt>Usage read</dt><dd>{{ fmtRelative(engine.Api.UsageObservedUtc, now) }}</dd></template>
                    </dl>
                    <OmniTraderBarList v-if="endpointItems.length" :items="endpointItems" :signed="false" :limit="8" :format="(v: number) => String(v)" />
                    <p v-if="unsupported.length" class="muted small">Metrics Instagram does not offer for these accounts (learned, no longer requested): {{ unsupported.join('; ') }}.</p>
                    <p class="muted small">Other OmniSettings: <code>OmniGram_GraphApiVersion</code>, <code>OmniGram_Proxy</code>, <code>OmniGram_PublicBaseUrl</code>.</p>
                </OmniTraderCard>
            </div>
        </template>

        <OmniGramConnectWizard :open="wizardOpen" :app="settings?.App ?? null" :reconnect-account-id="reconnectId" :reconnect-username="reconnectAccount?.Username ?? null"
                               :first-connection="!!reconnectAccount && !reconnectAccount.Connected" @close="wizardOpen = false" @done="onWizardDone" />
    </OmniGramShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAccess } from '~/composables/useAccess';
import {
    CONNECTION_LABEL, confirmAction, connectionTone, fmtDate, fmtRelative, igGet, igPost, notify, useGramOverview, useNow, usePoll,
    type PublicUrlCheck, type SettingsDto,
} from '~/composables/useOmniGram';

// App settings and connections are their own permission, above viewing accounts.
definePageMeta({ layout: 'navbar', access: { kind: 'keys', any: ['omnigram.settings.view'] } });
useHead({ title: 'Settings · OmniGram' });

const router = useRouter();
const { can } = useAccess();
const canManage = computed(() => can('omnigram.settings.manage'));
const { refresh: refreshOverview } = useGramOverview();
const now = useNow();

const settings = ref<SettingsDto | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const busy = ref(false);
const savingApp = ref(false);
const checking = ref(false);
const copied = ref(false);
const wizardOpen = ref(false);
const reconnectId = ref<string | null>(null);
const app = reactive({ appId: '', appSecret: '', redirectUrl: '' });

const engine = computed(() => settings.value!.Engine);
const check = computed<PublicUrlCheck | null>(() => settings.value?.Engine.PublicMedia.Check ?? null);
const reconnectAccount = computed(() => settings.value?.Accounts.find(a => a.AccountId === reconnectId.value) ?? null);

const fetchedRecently = computed(() => {
    const t = settings.value?.Engine.PublicMedia.LastExternalMediaFetchUtc;
    return !!t && now.value - new Date(t).getTime() < 3 * 86_400_000;
});
const publicTone = computed(() => (fetchedRecently.value || check.value?.Ok ? 'ok' : check.value ? 'bad' : ''));
const publicLabel = computed(() => (fetchedRecently.value ? 'Instagram fetches media' : check.value?.Ok ? 'Reachable' : check.value ? 'Not reachable' : 'Unchecked'));

const endpointItems = computed(() => Object.entries(settings.value?.Engine.Api.ByEndpointToday ?? {})
    .map(([key, value]) => ({ key, label: key, value, secondary: 'calls today' })));
const unsupported = computed(() => Object.entries(settings.value?.Engine.UnsupportedMetrics ?? {})
    .filter(([, list]) => list.length)
    .map(([kind, list]) => `${kind.toLowerCase()}: ${list.join(', ')}`));

async function load() {
    loading.value = true;
    const result = await igGet<SettingsDto>('/omnigram/settings');
    loading.value = false;
    if (result.ok && result.data) {
        settings.value = result.data;
        error.value = null;
    } else {
        error.value = result.error;
    }
}

usePoll(load, 30_000);

watch(() => settings.value?.App, a => {
    if (a && !app.redirectUrl) app.redirectUrl = a.RedirectUrl;
}, { immediate: true });

function typeLabel(t: string | null) {
    return t === 'MEDIA_CREATOR' ? 'Creator' : t === 'BUSINESS' ? 'Business' : t ? t.toLowerCase() : 'not connected';
}

function tokenTone(expires: string) {
    const days = (new Date(expires).getTime() - now.value) / 86_400_000;
    return days < 3 ? 'neg' : days < 7 ? 'warn' : '';
}

async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); copied.value = true; setTimeout(() => { copied.value = false; }, 1500); } catch { /* blocked */ }
}

async function saveApp() {
    savingApp.value = true;
    try {
        const result = await igPost<{ saved: boolean; message: string }>('/omnigram/settings/app', {
            appId: app.appId.trim() || null,
            appSecret: app.appSecret.trim() || null,
            redirectUrl: app.redirectUrl.trim() || null,
        });
        if (!result.ok) { notify('Not saved', result.error ?? '', 'error'); return; }
        notify('Saved', result.data?.message ?? '');
        app.appId = '';
        app.appSecret = '';
        await Promise.all([load(), refreshOverview()]);
    } finally {
        savingApp.value = false;
    }
}

async function checkPublicUrl() {
    checking.value = true;
    try {
        const result = await igPost<PublicUrlCheck>('/omnigram/settings/check-public-url', {});
        if (!result.ok || !result.data) notify('The check could not run', result.error ?? '', 'error');
        else if (result.data.Ok) notify('Reachable', `${result.data.BaseUrl} answered${result.data.LatencyMs != null ? ` in ${result.data.LatencyMs} ms` : ''}.`);
        else notify('Not reachable', result.data.Detail ?? '', 'warning');
        await Promise.all([load(), refreshOverview()]);
    } finally {
        checking.value = false;
    }
}

async function renewToken(accountId: string) {
    busy.value = true;
    try {
        const result = await igPost<{ refreshed: boolean }>('/omnigram/accounts/refresh-token', { accountId });
        if (!result.ok) notify('Could not renew the token', result.error ?? '', 'error');
        else notify(result.data?.refreshed ? 'Token renewed for another 60 days' : 'The token was not due for renewal');
        await load();
    } finally {
        busy.value = false;
    }
}

async function removeV1Passwords() {
    if (!(await confirmAction('Remove the v1 passwords?', 'The Password field is deleted from every OmniGram v1 account file and the v1 login sessions are deleted. Make sure you have the passwords elsewhere. This cannot be undone.', 'Remove passwords', true))) return;
    busy.value = true;
    try {
        const result = await igPost<{ files: number; sessions: number; remaining: boolean }>('/omnigram/settings/remove-v1-passwords', {});
        if (!result.ok || !result.data) notify('Could not remove them', result.error ?? '', 'error');
        else if (result.data.remaining) notify('Some passwords remain', `Cleaned ${result.data.files} file(s); some could not be changed. Check the server logs.`, 'warning');
        else notify('Removed', `Cleaned ${result.data.files} account file(s) and deleted ${result.data.sessions} session file(s).`);
        await Promise.all([load(), refreshOverview()]);
    } finally {
        busy.value = false;
    }
}

function openWizard(accountId: string | null) {
    reconnectId.value = accountId;
    wizardOpen.value = true;
}

async function onWizardDone(payload: { accountId: string | null; openStrategy: boolean }) {
    wizardOpen.value = false;
    await Promise.all([load(), refreshOverview()]);
    if (payload.accountId && payload.openStrategy) await router.push(`/schemery/omnigram/account/${payload.accountId}?tab=strategy`);
}
</script>

<style scoped>
.small { font-size: 11.5px; margin: var(--ot-space-2) 0; }
.small a, .guide a { color: var(--ot-info); text-decoration: underline; }
.copyrow { display: flex; flex-wrap: wrap; gap: var(--ot-space-2); align-items: center; }
.copyrow span { overflow-wrap: anywhere; }
.small-dd { font-size: 11.5px; overflow-wrap: anywhere; }
.guide { margin-top: var(--ot-space-3); font-size: 12.5px; color: var(--ot-text-2); }
.guide summary { cursor: pointer; }
.guide ol { margin: var(--ot-space-2) 0; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; }
.guide p { margin: 0; }
.appform { margin-top: var(--ot-space-4); display: flex; flex-direction: column; gap: var(--ot-space-3); align-items: flex-start; }
.appform .ot-formgrid { width: 100%; }
.ot-formgrid.wide { grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); }
.fullrow { grid-column: 1 / -1; }
.meters { display: flex; flex-direction: column; gap: var(--ot-space-3); margin: var(--ot-space-3) 0; }
.syncerrors ul { margin: 0; padding-left: 18px; font-size: 12px; color: var(--ot-warning); }
code { font-family: var(--ot-mono); font-size: 11.5px; }
.sub { display: block; font-size: 11px; color: var(--ot-muted); overflow-wrap: anywhere; }
.acct { display: flex; align-items: center; gap: var(--ot-space-2); }
.acctmain { display: flex; flex-direction: column; min-width: 0; }
.acctmain a { color: var(--ot-text); font-weight: 600; }
.acctmain a:hover { color: var(--ot-accent); }
.nowrap { white-space: nowrap; }
.rowacts { display: flex; gap: 4px; justify-content: flex-end; flex-wrap: wrap; }
.warn { color: var(--ot-warning); }
h2.ot-sectionhead { margin-top: var(--ot-space-6); }
</style>
