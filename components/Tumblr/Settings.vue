<template>
  <div class="tmb-pane" data-testid="tmb-settings">
    <div v-if="!settings" style="display: grid; gap: 10px"><div class="tmb-skel" style="height: 120px"></div><div class="tmb-skel" style="height: 160px"></div></div>
    <template v-else>
      <!-- the link to Tumblr -->
      <div id="tmb-link-history" class="tmb-panel" data-testid="tmb-link-history">
        <div class="tmb-panel__title"><TumblrIcon name="link" />Tumblr's answer to this server<small v-if="history?.CoverageStartUtc">recorded since {{ fmtDate(history.CoverageStartUtc) }}</small></div>
        <div v-if="gate?.Blocked" class="tmb-note" data-tone="crit" style="margin-bottom: 10px">
          <TumblrIcon name="unlink" />
          <div><strong>Refusing since {{ tmbClock(gate.BlockedSinceUtc) }}</strong> ({{ fmtRelative(gate.BlockedSinceUtc, now) }}). Every call gets an HTML 403 from Tumblr's edge before it reaches the API.
            Next check {{ tmbClock(gate.NextCheckUtc) }}<template v-if="gate.LastDetail"> · first refused: <span class="tmb-mono">{{ gate.LastDetail }}</span></template>.</div>
        </div>
        <div v-if="history" class="tmb-minikpis">
          <div class="tmb-minikpi"><b :class="(history.AnsweredPct7d ?? 100) < 90 ? 'tmb-neg' : 'tmb-pos'">{{ tmbPct(history.AnsweredPct7d) }}</b><span>answered, 7 days · {{ history.BlockedHours7d }} h refused</span></div>
          <div class="tmb-minikpi"><b>{{ tmbPct(history.AnsweredPct24h) }}</b><span>answered, 24 h · {{ history.Blocks24h }} blocks</span></div>
          <div class="tmb-minikpi"><b>{{ tmbMinutes(history.MedianBlockMinutes) }}</b><span>a typical block · longest {{ tmbMinutes(history.LongestBlockMinutes) }}</span></div>
          <div class="tmb-minikpi"><b>{{ tmbMinutes(history.MedianOpenMinutes) }}</b><span>a typical open spell between blocks</span></div>
        </div>
        <div v-if="history?.Days.length" style="margin-top: 12px">
          <div class="tmb-daybars" style="height: 54px">
            <span v-for="d in history.Days" :key="d.Day" :data-empty="d.Covered && !d.BlockedMinutes || undefined" :data-uncovered="!d.Covered || undefined"
                  :style="{ height: `${Math.max(3, (d.BlockedMinutes / 1440) * 100)}%` }" :title="d.Covered ? `${d.Day}: refused ${tmbMinutes(d.BlockedMinutes)} in ${d.Blocks} block(s)` : `${d.Day}: before the record starts`"></span>
          </div>
          <div style="display: flex; justify-content: space-between" class="tmb-help"><span>{{ history.Days[0].Day }}</span><span>hours refused each day</span><span>today</span></div>
        </div>
        <p v-if="history?.Triggers.length" class="tmb-help" style="margin-top: 8px">First call refused, last 7 days: {{ history.Triggers.map(t => `${t.Key} ×${t.Count}`).join(' · ') }}</p>
        <p v-else-if="history" class="tmb-help" style="margin-top: 8px">Blocks from now on also record the first call Tumblr refused.</p>
        <p class="tmb-help" style="margin-top: 8px">
          {{ engine.ProxyConfigured ? 'Tumblr traffic goes through the proxy in OmniSetting OmniTumblr_Proxy.' : 'No proxy is set. If Tumblr keeps refusing the server\'s address, OmniSetting OmniTumblr_Proxy routes its traffic another way.' }}
        </p>
      </div>

      <div class="tmb-cols">
        <!-- the app -->
        <div class="tmb-panel">
          <div class="tmb-panel__title">
            <TumblrIcon name="lock" />Tumblr app
            <span class="tmb-chip" :data-tone="settings.App.Configured ? (settings.App.LastVerifyError ? 'warn' : 'ok') : 'crit'" style="margin-left: auto">{{ settings.App.Configured ? (settings.App.LastVerifyError ? 'Not verified' : 'Verified') : 'Not set up' }}</span>
          </div>
          <dl class="tmb-kv">
            <dt>Consumer key</dt><dd class="tmb-mono">{{ settings.App.Configured ? `…${settings.App.KeyHint}` : 'not set' }}</dd>
            <dt>Verified</dt><dd>{{ settings.App.VerifiedUtc ? fmtWhen(settings.App.VerifiedUtc) : 'never' }}</dd>
            <dt>Method</dt><dd>{{ settings.App.AuthMode === 'OAuth2' ? 'OAuth 2.0, tokens refreshed automatically' : 'OAuth 1.0a, tokens never expire' }}</dd>
            <dt>Callback URL</dt>
            <dd style="display: flex; gap: 6px; align-items: center"><span class="tmb-mono tmb-truncate">{{ settings.App.CallbackUrl }}</span><button class="tmb-btn tmb-btn--xs" @click="copy(settings.App.CallbackUrl)">{{ copied ? 'Copied' : 'Copy' }}</button></dd>
          </dl>
          <p v-if="settings.App.LastVerifyError" class="tmb-error" style="margin-top: 8px">{{ settings.App.LastVerifyError }}</p>
          <form v-if="canManage" style="display: flex; flex-direction: column; gap: 10px; margin-top: 12px" @submit.prevent="saveApp">
            <div class="tmb-grid2">
              <div class="tmb-field"><label for="tmb-ck">OAuth consumer key</label><input id="tmb-ck" v-model="app.consumerKey" class="tmb-input tmb-mono" autocomplete="off" :placeholder="settings.App.Configured ? 'leave blank to keep' : ''" /></div>
              <div class="tmb-field"><label for="tmb-cs">Secret key</label><input id="tmb-cs" v-model="app.consumerSecret" type="password" class="tmb-input tmb-mono" autocomplete="off" :placeholder="settings.App.Configured ? 'leave blank to keep' : ''" /></div>
              <div class="tmb-field"><label for="tmb-cb">Callback URL</label><input id="tmb-cb" v-model="app.callbackUrl" class="tmb-input tmb-mono" /></div>
              <div class="tmb-field"><label for="tmb-am">Method for new connections</label>
                <select id="tmb-am" v-model="app.authMode" class="tmb-select"><option value="OAuth1">OAuth 1.0a</option><option value="OAuth2">OAuth 2.0</option></select></div>
            </div>
            <div><button class="tmb-btn" :disabled="savingApp">{{ savingApp ? 'Checking with Tumblr…' : 'Save and verify' }}</button></div>
          </form>
        </div>

        <!-- the engine -->
        <div class="tmb-panel">
          <div class="tmb-panel__title">
            <TumblrIcon name="server" />Engine
            <span class="tmb-chip" :data-tone="engine.Running && engine.PublishingEnabled ? 'ok' : 'warn'" style="margin-left: auto">{{ !engine.Enabled ? 'Disabled' : !engine.Running ? engine.StartupState : engine.PublishingEnabled ? 'Running' : 'Publishing off' }}</span>
          </div>
          <table class="tmb-table">
            <thead><tr><th>Loop</th><th>Last run</th><th>Last did</th></tr></thead>
            <tbody>
              <tr v-for="l in engine.Loops" :key="l.Name">
                <td><span class="tmb-chip tmb-chip--dot" :data-tone="loopFailing(l) ? 'crit' : 'ok'">{{ l.Name }}</span></td>
                <td class="tmb-dim" style="white-space: nowrap">{{ fmtRelative(l.LastTickUtc, now) }}</td>
                <td>{{ l.LastActivity ?? '—' }}<span v-if="l.LastActivityUtc" class="tmb-faint"> · {{ fmtRelative(l.LastActivityUtc, now) }}</span><div v-if="l.LastError" class="tmb-row__notice" data-tone="crit">{{ l.LastError }}</div></td>
              </tr>
            </tbody>
          </table>
          <div style="display: grid; gap: 8px; margin-top: 12px">
            <div v-for="m in meters" :key="m.label">
              <div style="display: flex; justify-content: space-between; font-size: 11.5px"><span class="tmb-dim">{{ m.label }}</span><span class="tmb-num">{{ m.used }} of {{ m.limit }}</span></div>
              <div class="tmb-meter" style="height: 6px; margin-top: 4px"><span :style="{ width: `${Math.min(100, (m.used / m.limit) * 100)}%` }" :data-tone="m.used / m.limit > 0.7 ? 'warn' : 'info'"></span></div>
            </div>
          </div>
          <dl class="tmb-kv" style="margin-top: 12px">
            <dt>MemeScraper</dt><dd :class="engine.MemeScraperReady ? 'tmb-pos' : 'tmb-neg'">{{ engine.MemeScraperReady ? 'ready' : 'not loaded' }}</dd>
            <dt>AI captions</dt><dd :class="engine.AiAvailable ? 'tmb-pos' : 'tmb-neg'">{{ engine.AiAvailable ? 'available' : 'KliveLLM not answering' }}</dd>
            <dt v-if="engine.TagResearch">Tag research</dt><dd v-if="engine.TagResearch">{{ engine.TagResearch.Enabled ? (engine.TagResearch.Available ? 'on' : 'on, but Tumblr can\'t be asked right now') : 'off' }} · {{ engine.TagResearch.TagsKnown }} tags known</dd>
            <dt v-if="engine.Reblogs">Curated reblogs</dt><dd v-if="engine.Reblogs">{{ engine.Reblogs.Enabled ? 'allowed (each blog switches them on)' : 'switched off for every blog' }}</dd>
            <template v-if="engine.Store">
              <dt>Store</dt>
              <dd>{{ engine.Store.WaitsLastHour }} lock wait{{ engine.Store.WaitsLastHour === 1 ? '' : 's' }} over 2 ms in the last hour<template v-if="engine.Store.MaxWaitLastHourMs"> (longest {{ Math.round(engine.Store.MaxWaitLastHourMs) }} ms)</template>
                · last save {{ Math.round(engine.Store.LastSaveMs) }} ms<template v-if="engine.Store.Fingerprints != null"> · {{ fmtCount(engine.Store.Fingerprints) }} fingerprints ({{ fmtBytes(engine.Store.FingerprintBytes) }})</template></dd>
            </template>
            <dt>Kill switches</dt><dd>OmniSettings <span class="tmb-code">OmniTumblr_Enabled</span> and <span class="tmb-code">OmniTumblrV2_PublishingEnabled</span></dd>
            <template v-if="engine.Migration"><dt>Migration</dt><dd>{{ engine.Migration }}</dd></template>
          </dl>
          <ul v-if="engine.SyncErrors?.length" style="margin-top: 10px" class="tmb-feed">
            <li v-for="e in engine.SyncErrors" :key="e.Job" style="grid-template-columns: auto minmax(0, 1fr)"><span class="tmb-mono">{{ e.Job }}</span><span class="tmb-neg">{{ e.Error }}</span></li>
          </ul>
        </div>
      </div>

      <!-- accounts -->
      <div class="tmb-panel">
        <div class="tmb-panel__title">
          <TumblrIcon name="user" />Tumblr accounts
          <button v-if="canManage" class="tmb-btn tmb-btn--sm" style="margin-left: auto" @click="emit('connect', null)"><TumblrIcon name="plus" />Connect an account</button>
        </div>
        <div v-if="!settings.Connections.length" class="tmb-empty">No accounts connected yet.</div>
        <div v-else style="display: grid; gap: 10px">
          <div v-for="c in settings.Connections" :key="c.ConnectionId" class="tmb-panel" style="background: var(--tmb-surface-2)" :data-testid="`conn-${c.UserName}`">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
              <b>@{{ c.UserName ?? 'unknown account' }}</b>
              <span class="tmb-chip" :data-tone="c.Health === 'Healthy' ? 'ok' : c.Health === 'NeedsReauth' ? 'crit' : 'neutral'">{{ c.Health === 'NeedsReauth' ? 'Needs reconnecting' : c.Health }}</span>
              <span class="tmb-dim" style="font-size: 12px">{{ c.AuthMode === 'OAuth2' ? 'OAuth 2.0' : 'OAuth 1.0a' }} · connected {{ fmtDate(c.CreatedUtc) }} · checked {{ fmtRelative(c.LastVerifiedUtc, now) }}</span>
              <div v-if="canManage" style="margin-left: auto; display: flex; gap: 4px">
                <button class="tmb-btn tmb-btn--xs" @click="emit('connect', c.ConnectionId)">Reconnect</button>
                <button class="tmb-btn tmb-btn--xs tmb-btn--ghost" @click="emit('refresh-connection', c.ConnectionId)">Refresh</button>
                <button class="tmb-btn tmb-btn--xs tmb-btn--danger" :disabled="c.ManagedBlogs > 0" :title="c.ManagedBlogs ? 'Stop managing its blogs first' : ''" @click="emit('remove-connection', c.ConnectionId)">Remove</button>
              </div>
            </div>
            <p v-if="c.HealthDetail" class="tmb-help" style="margin-top: 4px">{{ c.HealthDetail }}</p>
            <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px">
              <div v-for="b in c.Blogs" :key="b.Name" style="display: inline-flex; align-items: center; gap: 7px; padding: 4px 8px 4px 4px; border-radius: 999px; border: 1px solid var(--tmb-line)">
                <TumblrAvatar :src="b.AvatarUrl" :name="b.Name" :size="22" />
                <span>@{{ b.Name }}</span>
                <span class="tmb-faint" style="font-size: 11px">{{ b.Followers != null ? `${fmtCount(b.Followers)} followers` : '' }}</span>
                <span v-if="b.Managed" class="tmb-chip" data-tone="accent">managed</span>
                <button v-else-if="canManageBlogs" class="tmb-btn tmb-btn--xs" @click="emit('manage', c.ConnectionId, b.Name)">Manage</button>
              </div>
            </div>
            <div v-if="c.Limits.length" class="tmb-help" style="margin-top: 8px">
              Tumblr's daily limits: <template v-for="(l, i) in c.Limits.filter(x => x.Remaining < x.Limit)" :key="l.Key">{{ i ? ' · ' : '' }}{{ l.Key.replace(/_/g, ' ') }} {{ l.Limit - l.Remaining }}/{{ l.Limit }}</template>
              <template v-if="!c.Limits.some(x => x.Remaining < x.Limit)">nothing used today</template>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { fmtBytes, fmtCount, fmtDate, fmtRelative, fmtWhen, tumblrPost, type AuthMode, type EngineLoop } from '~/composables/useOmniTumblr';
import type { TumblrSettingsView } from '~/composables/useTumblrConsole';
import { tmbClock, tmbMinutes, tmbPct, type TmbEdgeHistory, type TmbEngine } from '~/scripts/tumblrConsole';

const props = defineProps<{ settings: TumblrSettingsView | null; history: TmbEdgeHistory | null; now: number; canManage: boolean; canManageBlogs: boolean }>();
const emit = defineEmits<{ connect: [connectionId: string | null]; 'refresh-connection': [id: string]; 'remove-connection': [id: string]; manage: [connectionId: string, blogName: string]; saved: [message: string, ok: boolean] }>();

const engine = computed(() => props.settings!.Engine as TmbEngine);
const gate = computed(() => engine.value.EdgeGate ?? null);
const meters = computed(() => [
  { label: 'Tumblr calls this hour', used: engine.value.Api.CallsThisHour, limit: engine.value.Api.HourlyLimit },
  { label: 'Tumblr calls today', used: engine.value.Api.CallsToday, limit: engine.value.Api.DailyLimit },
]);
const loopFailing = (l: EngineLoop) => !!l.LastError && !!l.LastErrorUtc && (!l.LastTickUtc || l.LastErrorUtc > l.LastTickUtc);

const app = reactive({ consumerKey: '', consumerSecret: '', callbackUrl: '', authMode: 'OAuth1' as AuthMode });
watch(() => props.settings?.App, a => {
  if (!a) return;
  if (!app.callbackUrl) app.callbackUrl = a.CallbackUrl;
  app.authMode = a.AuthMode;
}, { immediate: true });

const savingApp = ref(false);
async function saveApp() {
  savingApp.value = true;
  try {
    const result = await tumblrPost<{ Message: string; Verified: boolean }>('/omnitumblr/settings/app', {
      consumerKey: app.consumerKey.trim() || null,
      consumerSecret: app.consumerSecret.trim() || null,
      callbackUrl: app.callbackUrl.trim() || null,
      authMode: app.authMode,
    });
    if (!result.ok) { emit('saved', result.error ?? 'Not saved', false); return; }
    app.consumerKey = '';
    app.consumerSecret = '';
    emit('saved', result.data?.Verified ? 'Saved and verified with Tumblr' : (result.data?.Message ?? 'Saved'), !!result.data?.Verified);
  } finally {
    savingApp.value = false;
  }
}

const copied = ref(false);
async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); copied.value = true; window.setTimeout(() => { copied.value = false; }, 1500); } catch { /* blocked */ }
}
</script>
