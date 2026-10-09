<template>
    <OmniTumblrShell @refresh="load">
        <div class="ot-pagehead">
            <div>
                <h1>Settings</h1>
                <p class="subtitle">The Tumblr app, connected accounts and the engine.</p>
            </div>
            <div v-if="canManage" class="ot-actions">
                <button class="ot-btn primary" @click="openWizard(null)">Connect a Tumblr account</button>
            </div>
        </div>

        <div v-if="!settings && loading" class="ot-skelrows"><div class="ot-skel" style="height:200px"></div></div>
        <OmniTraderStateBlock v-else-if="!settings && error" kind="error" title="Could not load settings" :detail="error" />

        <template v-else-if="settings">
            <div class="ot-grid two">
                <!-- Tumblr app -->
                <OmniTraderCard title="Tumblr app" subtitle="The OAuth app OmniTumblr authorizes accounts through. Secrets are stored encrypted.">
                    <template #controls>
                        <span class="ot-chip" :class="settings.App.Configured ? (settings.App.LastVerifyError ? 'warn' : 'ok') : 'bad'">
                            {{ settings.App.Configured ? (settings.App.LastVerifyError ? 'Unverified' : 'Verified') : 'Not set up' }}
                        </span>
                    </template>
                    <dl class="ot-kv">
                        <dt>Consumer key</dt><dd>{{ settings.App.Configured ? `…${settings.App.KeyHint}` : 'not set' }}</dd>
                        <dt>Verified</dt><dd>{{ settings.App.VerifiedUtc ? fmtWhen(settings.App.VerifiedUtc) : 'never' }}</dd>
                        <dt>Method</dt><dd>{{ settings.App.AuthMode === 'OAuth2' ? 'OAuth 2.0 (tokens refreshed automatically)' : 'OAuth 1.0a (tokens never expire)' }}</dd>
                        <dt>Callback URL</dt>
                        <dd class="copyrow"><span>{{ settings.App.CallbackUrl }}</span>
                            <button type="button" class="ot-btn sm ghost" @click="copy(settings.App.CallbackUrl)">{{ copied ? 'Copied' : 'Copy' }}</button></dd>
                    </dl>
                    <p v-if="settings.App.LastVerifyError" class="neg small">{{ settings.App.LastVerifyError }}</p>
                    <p class="muted small">
                        Register the app at <a href="https://www.tumblr.com/oauth/apps" target="_blank" rel="noopener noreferrer">tumblr.com/oauth/apps</a>.
                        Its <em>Default callback URL</em> must be exactly the URL above (for OAuth 2.0, also add it under <em>OAuth2 redirect URLs</em>).
                    </p>

                    <form v-if="canManage" class="appform" @submit.prevent="saveApp">
                        <div class="ot-formgrid wide">
                            <div class="ot-field">
                                <label for="ck">OAuth consumer key</label>
                                <input id="ck" v-model="app.consumerKey" class="ot-input mono" autocomplete="off" :placeholder="settings.App.Configured ? 'leave blank to keep' : ''" />
                            </div>
                            <div class="ot-field">
                                <label for="cs">Secret key</label>
                                <input id="cs" v-model="app.consumerSecret" class="ot-input mono" type="password" autocomplete="off" :placeholder="settings.App.Configured ? 'leave blank to keep' : ''" />
                            </div>
                            <div class="ot-field">
                                <label for="cb">Callback URL</label>
                                <input id="cb" v-model="app.callbackUrl" class="ot-input mono" />
                            </div>
                            <div class="ot-field">
                                <label for="am">Method for new connections</label>
                                <select id="am" v-model="app.authMode" class="ot-select">
                                    <option value="OAuth1">OAuth 1.0a</option>
                                    <option value="OAuth2">OAuth 2.0</option>
                                </select>
                            </div>
                        </div>
                        <button class="ot-btn" :disabled="savingApp">{{ savingApp ? 'Checking with Tumblr…' : 'Save and verify' }}</button>
                    </form>
                </OmniTraderCard>

                <!-- Engine -->
                <OmniTraderCard title="Engine" subtitle="The loops that plan, publish and measure.">
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
                                    <td>{{ fmtRelative(l.LastTickUtc, now) }}</td>
                                    <td>{{ l.LastActivity ? `${l.LastActivity} (${fmtRelative(l.LastActivityUtc, now)})` : '—' }}
                                        <span v-if="l.LastError" class="sub neg">{{ l.LastError }}</span></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                    <div class="meters">
                        <OmniTraderMeter label="Tumblr API calls this hour" :value="String(engine.Api.CallsThisHour)" :limit="`of ${engine.Api.HourlyLimit}`"
                                         :percent="(engine.Api.CallsThisHour / engine.Api.HourlyLimit) * 100" :warn-at="60" />
                        <OmniTraderMeter label="Tumblr API calls today" :value="String(engine.Api.CallsToday)" :limit="`of ${engine.Api.DailyLimit}`"
                                         :percent="(engine.Api.CallsToday / engine.Api.DailyLimit) * 100" :warn-at="70" />
                    </div>
                    <dl class="ot-kv">
                        <dt>MemeScraper</dt><dd :class="engine.MemeScraperReady ? 'pos' : 'neg'">{{ engine.MemeScraperReady ? 'ready' : 'not loaded' }}</dd>
                        <dt>AI captions</dt><dd :class="engine.AiAvailable ? 'pos' : 'neg'">{{ engine.AiAvailable ? 'KliveLLM available' : 'KliveLLM not running' }}</dd>
                        <dt v-if="engine.Api.PerDayRemaining != null">Tumblr says</dt>
                        <dd v-if="engine.Api.PerDayRemaining != null">{{ engine.Api.PerHourRemaining }} calls left this hour, {{ engine.Api.PerDayRemaining }} today</dd>
                        <dt>Kill switches</dt><dd>OmniSettings <code>OmniTumblr_Enabled</code> (whole engine) and <code>OmniTumblrV2_PublishingEnabled</code> (publishing only)</dd>
                        <dt v-if="engine.Migration">Migration</dt><dd v-if="engine.Migration">{{ engine.Migration }}</dd>
                    </dl>
                    <div v-if="engine.SyncErrors?.length" class="syncerrors">
                        <h4 class="ot-sectionhead">Sync problems</h4>
                        <ul>
                            <li v-for="e in engine.SyncErrors" :key="e.Job"><span class="mono">{{ e.Job }}</span> — {{ e.Error }}</li>
                        </ul>
                    </div>
                </OmniTraderCard>
            </div>

            <!-- Connections -->
            <h2 class="ot-sectionhead">Tumblr accounts</h2>
            <div v-if="!settings.Connections.length" class="ot-card"><div class="body">
                <OmniTraderStateBlock title="No accounts connected" detail="Connect the Tumblr account that owns your blogs.">
                    <button v-if="canManage" class="ot-btn primary" @click="openWizard(null)">Connect a Tumblr account</button>
                </OmniTraderStateBlock>
            </div></div>
            <div class="ot-stack">
                <OmniTraderCard v-for="c in settings.Connections" :key="c.ConnectionId" :title="`@${c.UserName ?? 'unknown account'}`"
                                :subtitle="`${c.AuthMode === 'OAuth2' ? 'OAuth 2.0' : 'OAuth 1.0a'} · connected ${fmtDate(c.CreatedUtc)} · ${c.ManagedBlogs} managed blog(s)`"
                                :attention="c.Health === 'NeedsReauth'">
                    <template #controls>
                        <span class="ot-chip" :class="c.Health === 'Healthy' ? 'ok' : c.Health === 'NeedsReauth' ? 'bad' : ''">{{ c.Health === 'NeedsReauth' ? 'Needs reconnecting' : c.Health }}</span>
                        <template v-if="canManage">
                            <button class="ot-btn sm" @click="openWizard(c.ConnectionId)">Reconnect</button>
                            <button class="ot-btn sm ghost" :disabled="busy" @click="refreshConnection(c.ConnectionId)">Refresh</button>
                            <button class="ot-btn sm danger" :disabled="busy || c.ManagedBlogs > 0" :title="c.ManagedBlogs ? 'Remove its managed blogs first' : ''" @click="removeConnection(c)">Remove</button>
                        </template>
                    </template>
                    <p v-if="c.HealthDetail" class="small" :class="c.Health === 'NeedsReauth' ? 'neg' : 'muted'">{{ c.HealthDetail }}</p>
                    <div class="ot-grid two">
                        <div>
                            <h4 class="ot-sectionhead">Blogs on this account</h4>
                            <ul class="connblogs">
                                <li v-for="b in c.Blogs" :key="b.Name">
                                    <OmniTumblrAvatar :src="b.AvatarUrl" :name="b.Name" :size="28" />
                                    <div class="cbmain">
                                        <span>@{{ b.Name }}<span v-if="b.Primary" class="muted"> · primary</span></span>
                                        <span class="muted small">{{ b.Followers != null ? `${fmtCount(b.Followers)} followers` : '' }} {{ b.Title ? `· ${b.Title}` : '' }}</span>
                                    </div>
                                    <NuxtLink v-if="b.Managed && b.ManagedBlogId" class="ot-btn sm ghost" :to="`/schemery/omnitumblr/blog/${b.ManagedBlogId}`">Open</NuxtLink>
                                    <button v-else-if="can('omnitumblr.blogs.manage')" class="ot-btn sm" :disabled="busy" @click="manage(c.ConnectionId, b.Name)">Manage</button>
                                </li>
                            </ul>
                            <p class="muted small">Last checked {{ fmtRelative(c.LastVerifiedUtc, now) }}<template v-if="c.AccessTokenExpiresUtc"> · access token renews {{ fmtRelative(c.AccessTokenExpiresUtc, now) }}</template></p>
                        </div>
                        <div>
                            <h4 class="ot-sectionhead">Tumblr's daily limits</h4>
                            <div v-if="c.Limits.length" class="meters">
                                <OmniTraderMeter v-for="l in c.Limits" :key="l.Key" :label="l.Description ?? l.Key.replace(/_/g, ' ')"
                                                 :value="`${l.Limit - l.Remaining} used`" :limit="`of ${l.Limit}${l.ResetUtc ? ` · resets ${fmtRelative(l.ResetUtc, now)}` : ''}`"
                                                 :percent="l.Limit ? ((l.Limit - l.Remaining) / l.Limit) * 100 : null" />
                            </div>
                            <p v-else class="muted small">Not read yet — checked hourly.</p>
                        </div>
                    </div>
                </OmniTraderCard>
            </div>
        </template>

        <OmniTumblrConnectWizard :open="wizardOpen" :app="settings?.App ?? null" :reconnect-connection-id="reconnectId"
                                 @close="wizardOpen = false" @done="onWizardDone" />
    </OmniTumblrShell>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAccess } from '~/composables/useAccess';
import {
    confirmAction, fmtCount, fmtDate, fmtRelative, fmtWhen, notify, tumblrGet, tumblrPost, useNow, usePoll, useTumblrOverview,
    type AppConfig, type AuthMode, type Connection, type EngineStatus,
} from '~/composables/useOmniTumblr';

// App settings and Tumblr connections are their own permission, above viewing blogs.
definePageMeta({ layout: 'navbar', access: { kind: 'keys', any: ['omnitumblr.settings.view'] } });
useHead({ title: 'Settings · OmniTumblr' });

interface Settings { App: AppConfig; Connections: Connection[]; Engine: EngineStatus }

const router = useRouter();
const { can } = useAccess();
// App keys and Tumblr connections.
const canManage = computed(() => can('omnitumblr.settings.manage'));
const { refresh: refreshOverview } = useTumblrOverview();
const now = useNow();

const settings = ref<Settings | null>(null);
const loading = ref(false);
const error = ref<string | null>(null);
const busy = ref(false);
const savingApp = ref(false);
const copied = ref(false);
const wizardOpen = ref(false);
const reconnectId = ref<string | null>(null);
const app = reactive({ consumerKey: '', consumerSecret: '', callbackUrl: '', authMode: 'OAuth1' as AuthMode });

const engine = computed(() => settings.value!.Engine);

async function load() {
    loading.value = true;
    const result = await tumblrGet<Settings>('/omnitumblr/settings');
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
    if (!a) return;
    if (!app.callbackUrl) app.callbackUrl = a.CallbackUrl;
    app.authMode = a.AuthMode;
}, { immediate: true });

async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); copied.value = true; setTimeout(() => { copied.value = false; }, 1500); } catch { /* blocked */ }
}

async function saveApp() {
    savingApp.value = true;
    try {
        const result = await tumblrPost<{ Message: string; Verified: boolean }>('/omnitumblr/settings/app', {
            consumerKey: app.consumerKey.trim() || null,
            consumerSecret: app.consumerSecret.trim() || null,
            callbackUrl: app.callbackUrl.trim() || null,
            authMode: app.authMode,
        });
        if (!result.ok) { notify('Not saved', result.error ?? '', 'error'); return; }
        notify(result.data?.Verified ? 'Saved and verified' : 'Saved', result.data?.Message ?? '', result.data?.Verified ? 'success' : 'warning');
        app.consumerKey = '';
        app.consumerSecret = '';
        await Promise.all([load(), refreshOverview()]);
    } finally {
        savingApp.value = false;
    }
}

async function refreshConnection(connectionId: string) {
    busy.value = true;
    try {
        const result = await tumblrPost('/omnitumblr/connections/refresh', { connectionId });
        if (!result.ok) notify('Refresh failed', result.error ?? '', 'error');
        else notify('Account refreshed');
        await load();
    } finally {
        busy.value = false;
    }
}

async function removeConnection(c: Connection) {
    if (!(await confirmAction(`Remove @${c.UserName}?`, 'OmniTumblr forgets this account and its tokens. To fully revoke access, also remove the app in Tumblr\'s settings (Apps).', 'Remove', true))) return;
    const result = await tumblrPost('/omnitumblr/connections/remove', { connectionId: c.ConnectionId });
    if (!result.ok) notify('Could not remove it', result.error ?? '', 'error');
    await Promise.all([load(), refreshOverview()]);
}

async function manage(connectionId: string, blogName: string) {
    busy.value = true;
    try {
        const result = await tumblrPost<{ Added: { BlogId: string }[]; Skipped: string[] }>('/omnitumblr/blogs/add', { connectionId, blogs: [blogName], autopilot: false, preset: 'weekly-memes' });
        if (!result.ok || !result.data) { notify('Could not add the blog', result.error ?? '', 'error'); return; }
        await refreshOverview();
        if (result.data.Added.length) await router.push(`/schemery/omnitumblr/blog/${result.data.Added[0].BlogId}?tab=strategy`);
        else notify('Not added', result.data.Skipped.join(' '), 'info');
    } finally {
        busy.value = false;
    }
}

function openWizard(connectionId: string | null) {
    reconnectId.value = connectionId;
    wizardOpen.value = true;
}

async function onWizardDone(payload: { connectionId: string | null; blogIds: string[] }) {
    wizardOpen.value = false;
    await Promise.all([load(), refreshOverview()]);
    if (payload.blogIds.length) await router.push(`/schemery/omnitumblr/blog/${payload.blogIds[0]}?tab=strategy`);
}
</script>

<style scoped>
.small { font-size: 11.5px; margin: var(--ot-space-2) 0 0; }
.small a { color: var(--ot-info); text-decoration: underline; }
.copyrow { display: flex; gap: var(--ot-space-2); align-items: center; }
.appform { margin-top: var(--ot-space-4); display: flex; flex-direction: column; gap: var(--ot-space-3); align-items: flex-start; }
.appform .ot-formgrid { width: 100%; }
.ot-formgrid.wide { grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); }
.meters { display: flex; flex-direction: column; gap: var(--ot-space-3); margin: var(--ot-space-3) 0; }
.syncerrors ul { margin: 0; padding-left: 18px; font-size: 12px; color: var(--ot-warning); }
code { font-family: var(--ot-mono); font-size: 11.5px; }
.connblogs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.connblogs li { display: flex; align-items: center; gap: var(--ot-space-2); padding: 6px 0; }
.connblogs li + li { border-top: 1px solid var(--ot-line); }
.cbmain { display: flex; flex-direction: column; flex: 1 1 auto; min-width: 0; font-size: 13px; }
h2.ot-sectionhead { margin-top: var(--ot-space-6); }
</style>
