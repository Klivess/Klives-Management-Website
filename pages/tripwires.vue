<template>
  <div class="tw-page">
    <header class="tw-topbar">
      <div>
        <div class="tw-eyebrow"><span class="tw-live-dot"></span> Tracked redirects</div>
        <h1>Tripwires</h1>
        <p>Create clean redirect links and see the moment they are opened.</p>
      </div>
      <div class="tw-top-actions">
        <button class="tw-button tw-button--ghost" type="button" :disabled="loading" @click="() => loadTripwires()">
          <span :class="{ spin: loading }">↻</span> Refresh
        </button>
        <button class="tw-button tw-button--primary" type="button" data-testid="new-tripwire" @click="openCreate">＋ New tripwire</button>
      </div>
    </header>

    <div v-if="error && !tripwires.length" class="tw-error-state">
      <span>!</span><h2>Tripwires could not be loaded</h2><p>{{ error }}</p>
      <button class="tw-button tw-button--primary" type="button" @click="() => loadTripwires()">Try again</button>
    </div>

    <div v-else class="tw-workspace">
      <aside class="tw-sidebar">
        <div class="tw-search-wrap">
          <span>⌕</span>
          <input v-model="search" class="tw-search" type="search" placeholder="Find a tripwire…" aria-label="Find a tripwire" />
        </div>
        <div v-if="loading && !tripwires.length" class="tw-skeleton-list">
          <div v-for="i in 4" :key="i" class="tw-skeleton-card"></div>
        </div>
        <button
          v-for="tripwire in filteredTripwires"
          :key="tripwire.id"
          class="tw-list-card"
          :class="{ active: tripwire.id === selectedId }"
          type="button"
          @click="selectTripwire(tripwire.id)"
        >
          <span class="tw-list-bolt">⚡</span>
          <span class="tw-list-copy">
            <strong>{{ tripwire.name }}</strong>
            <small>{{ tripwire.targets.length }} {{ tripwire.targets.length === 1 ? 'link' : 'links' }} · {{ tripwire.totalTrips.toLocaleString() }} trips</small>
          </span>
          <span class="tw-status-dot" :class="statusClass(tripwire.status)" :title="tripwire.status"></span>
        </button>
        <div v-if="!loading && !filteredTripwires.length" class="tw-empty-list">
          <span>⚡</span>
          <p>{{ search ? 'No matching tripwires.' : 'No tripwires yet.' }}</p>
          <button v-if="!search" type="button" @click="openCreate">Create the first one</button>
        </div>
      </aside>

      <main v-if="selected" class="tw-main">
        <section class="tw-hero">
          <div class="tw-hero-title">
            <span class="tw-bolt-tile">⚡</span>
            <div>
              <div class="tw-title-line">
                <h2>{{ selected.name }}</h2>
                <span class="tw-status-pill" :class="statusClass(selected.status)">{{ selected.status }}</span>
              </div>
              <p>Created by {{ selected.createdBy }} · {{ formatDate(selected.createdUtc) }}</p>
            </div>
          </div>
          <div class="tw-hero-actions">
            <button class="tw-icon-button" type="button" title="Edit settings" aria-label="Edit settings" @click="activeTab = 'settings'">⚙</button>
            <button class="tw-icon-button tw-icon-button--danger" type="button" title="Delete tripwire" aria-label="Delete tripwire" @click="deleteTripwire">⌫</button>
          </div>
        </section>

        <section class="tw-metrics">
          <article><small>Total trips</small><strong>{{ (summary?.totalTrips ?? selected.totalTrips).toLocaleString() }}</strong><span>all time</span></article>
          <article><small>Unique visitors</small><strong>{{ (summary?.uniqueTrips ?? 0).toLocaleString() }}</strong><span>deduplicated</span></article>
          <article><small>Last 24 hours</small><strong>{{ (summary?.tripsLast24Hours ?? 0).toLocaleString() }}</strong><span>{{ last24Trend }}</span></article>
          <article><small>Last tripped</small><strong class="tw-metric-time">{{ relativeTime(summary?.lastTrippedUtc ?? selected.lastTrippedUtc) }}</strong><span>{{ selected.lastTrippedUtc ? formatTime(selected.lastTrippedUtc) : 'waiting for first trip' }}</span></article>
        </section>

        <section class="tw-panel tw-links-panel">
          <div class="tw-panel-head">
            <div><h3>Live links</h3><p>Share these URLs. Each one redirects straight to its destination.</p></div>
            <button class="tw-small-button" type="button" @click="copyAllLinks">Copy all</button>
          </div>
          <div class="tw-link-list">
            <article v-for="target in selected.targets" :key="target.id" class="tw-link-row" :class="{ muted: !target.enabled }">
              <div class="tw-link-state"><span :class="target.enabled ? 'active' : ''"></span></div>
              <div class="tw-link-detail">
                <strong>{{ target.label }}</strong>
                <a :href="target.destinationUrl" target="_blank" rel="noopener noreferrer" :title="target.destinationUrl">{{ target.destinationUrl }}</a>
              </div>
              <code>{{ target.trackingUrl }}</code>
              <span class="tw-link-count">{{ target.tripCount.toLocaleString() }} trips</span>
              <button class="tw-copy" type="button" :aria-label="`Copy ${target.label} link`" @click="copyLink(target.trackingUrl, target.id)">
                {{ copiedId === target.id ? '✓ Copied' : 'Copy' }}
              </button>
            </article>
          </div>
        </section>

        <div class="tw-tabs" role="tablist">
          <button type="button" :class="{ active: activeTab === 'activity' }" @click="activeTab = 'activity'">Activity <span>{{ eventsPage.total }}</span></button>
          <button type="button" :class="{ active: activeTab === 'settings' }" @click="activeTab = 'settings'">Settings</button>
        </div>

        <template v-if="activeTab === 'activity'">
          <section class="tw-activity-grid">
            <article class="tw-panel tw-chart-panel">
              <div class="tw-panel-head"><div><h3>Trips over time</h3><p>Last 14 days</p></div><strong>{{ summary?.tripsLast7Days ?? 0 }} <small>this week</small></strong></div>
              <div class="tw-chart" aria-label="Trips during the last 14 days">
                <div v-for="point in chartPoints" :key="point.date" class="tw-bar-slot" :title="`${point.date}: ${point.count}`">
                  <span class="tw-bar-value">{{ point.count || '' }}</span>
                  <i :style="{ height: `${point.height}%` }"></i>
                  <small>{{ point.label }}</small>
                </div>
              </div>
            </article>
            <article class="tw-panel tw-breakdown">
              <div class="tw-panel-head"><div><h3>Top locations</h3><p>All recorded trips</p></div></div>
              <div v-if="summary?.countries?.length" class="tw-breakdown-list">
                <div v-for="country in summary.countries.slice(0, 5)" :key="country.value">
                  <span>{{ country.value }}</span><i><b :style="{ width: `${percentOf(country.count, summary.totalTrips)}%` }"></b></i><strong>{{ country.count }}</strong>
                </div>
              </div>
              <div v-else class="tw-no-data">Location data will appear after a trip.</div>
            </article>
          </section>

          <section class="tw-panel tw-events-panel">
            <div class="tw-panel-head tw-events-head">
              <div><h3>Event stream</h3><p>Newest trips first. Updates automatically.</p></div>
              <div class="tw-event-actions">
                <select v-model="targetFilter" class="tw-select" aria-label="Filter by link" @change="loadEvents">
                  <option value="">All links</option>
                  <option v-for="target in selected.targets" :key="target.id" :value="target.id">{{ target.label }}</option>
                </select>
                <details class="tw-columns">
                  <summary>Columns</summary>
                  <label v-for="column in optionalColumns" :key="column.key"><input v-model="visibleColumns" type="checkbox" :value="column.key" /> {{ column.label }}</label>
                </details>
                <button class="tw-small-button" type="button" :disabled="!eventsPage.items.length" @click="exportEvents">Export CSV</button>
              </div>
            </div>
            <div v-if="eventsLoading" class="tw-table-loading"><span></span> Loading events…</div>
            <div v-else-if="!eventsPage.items.length" class="tw-event-empty">
              <span>◎</span><h4>Listening for the first trip</h4><p>Copy one of the live links above and share it. New events will appear here.</p>
            </div>
            <div v-else class="tw-table-wrap">
              <table>
                <thead><tr><th>Time</th><th>Link</th><th v-if="hasColumn('location')">Location</th><th v-if="hasColumn('ip')">IP address</th><th v-if="hasColumn('device')">Device</th><th v-if="hasColumn('referrer')">Referrer</th><th>Flags</th></tr></thead>
                <tbody>
                  <template v-for="event in eventsPage.items" :key="event.id">
                  <tr>
                    <td><strong>{{ relativeTime(event.trippedUtc) }}</strong><small>{{ formatTime(event.trippedUtc) }}</small></td>
                    <td><strong>{{ event.targetLabel || 'Deleted link' }}</strong><small class="tw-truncate">{{ event.destinationUrl }}</small></td>
                    <td v-if="hasColumn('location')"><strong>{{ eventLocation(event) }}</strong><small v-if="event.latitude != null && event.longitude != null">{{ event.latitude.toFixed(2) }}, {{ event.longitude.toFixed(2) }}</small></td>
                    <td v-if="hasColumn('ip')"><code>{{ event.ipAddress || privacyLabel(event) }}</code></td>
                    <td v-if="hasColumn('device')"><strong>{{ event.deviceType || 'Unknown' }}</strong><small>{{ [event.operatingSystem, event.browser].filter(Boolean).join(' · ') || event.userAgent || 'Not collected' }}</small></td>
                    <td v-if="hasColumn('referrer')"><span class="tw-truncate">{{ event.referrer || 'Direct / not collected' }}</span></td>
                    <td><div class="tw-flags"><span v-if="event.isUnique" class="unique">Unique</span><span v-else>Repeat</span><span v-if="event.discordNotified" class="discord">Discord</span><span v-if="event.isBot">Bot</span><span v-if="event.doNotTrack">DNT</span><button type="button" @click="expandedEventId = expandedEventId === event.id ? '' : event.id">{{ expandedEventId === event.id ? 'Hide' : 'Details' }}</button></div></td>
                  </tr>
                  <tr v-if="expandedEventId === event.id" class="tw-detail-row">
                    <td :colspan="3 + visibleColumns.length">
                      <div class="tw-event-detail">
                        <div><small>Exact time</small><strong>{{ new Date(event.trippedUtc).toISOString() }}</strong></div>
                        <div><small>Visitor ID</small><strong>{{ event.visitorHash || privacyLabel(event) }}</strong></div>
                        <div><small>Language</small><strong>{{ event.language || 'Not collected' }}</strong></div>
                        <div><small>Timezone</small><strong>{{ event.timezone || 'Unknown' }}</strong></div>
                        <div class="wide"><small>Full user agent</small><code>{{ event.userAgent || 'Not collected' }}</code></div>
                        <div class="wide"><small>Query parameters</small><code>{{ prettyQuery(event.queryParametersJson) }}</code></div>
                        <div v-if="event.notificationError" class="wide error"><small>Discord delivery error</small><strong>{{ event.notificationError }}</strong></div>
                      </div>
                    </td>
                  </tr>
                  </template>
                </tbody>
              </table>
            </div>
            <div v-if="eventsPage.total > eventsPage.limit" class="tw-pagination">
              <button type="button" :disabled="eventsPage.offset === 0" @click="changePage(-1)">Previous</button>
              <span>{{ eventsPage.offset + 1 }}–{{ Math.min(eventsPage.offset + eventsPage.limit, eventsPage.total) }} of {{ eventsPage.total }}</span>
              <button type="button" :disabled="eventsPage.offset + eventsPage.limit >= eventsPage.total" @click="changePage(1)">Next</button>
            </div>
          </section>
        </template>

        <template v-else>
          <section class="tw-settings-grid">
            <div class="tw-panel tw-settings-main">
              <div class="tw-panel-head"><div><h3>Tripwire settings</h3><p>Changes apply to every live link in this tripwire.</p></div><span v-if="dirty" class="tw-unsaved">Unsaved changes</span></div>
              <div class="tw-form-section">
                <label class="tw-field"><span>Name</span><input v-model.trim="settingsName" maxlength="120" type="text" /></label>
                <ToggleRow v-model="settingsDraft.enabled" title="Tripwire active" description="Disable every link without deleting their history." />
                <div class="tw-field-row">
                  <label class="tw-field"><span>Expiry (optional)</span><input v-model="expiresLocal" type="datetime-local" /></label>
                  <label class="tw-field"><span>Maximum trips (optional)</span><input v-model.number="settingsDraft.maxTrips" min="1" type="number" placeholder="Unlimited" /></label>
                  <label class="tw-field"><span>Redirect type</span><select v-model.number="settingsDraft.redirectStatusCode"><option :value="302">302 · Temporary</option><option :value="307">307 · Preserve method</option><option :value="301">301 · Permanent</option><option :value="308">308 · Permanent + preserve</option></select></label>
                </div>
              </div>

              <div class="tw-form-section">
                <div class="tw-section-title"><span>Capture</span><small>Time and clicked link are always recorded</small></div>
                <div class="tw-toggle-grid">
                  <ToggleRow v-model="settingsDraft.captureIpAddress" title="IP address" description="Store the visitor's public IP." />
                  <ToggleRow v-model="settingsDraft.captureLocation" title="Approximate location" description="Resolve country, region and city from IP." />
                  <ToggleRow v-model="settingsDraft.captureUserAgent" title="Full user agent" description="Keep the raw browser user-agent string." />
                  <ToggleRow v-model="settingsDraft.captureDeviceDetails" title="Device details" description="Parse browser, OS and device type." />
                  <ToggleRow v-model="settingsDraft.captureReferrer" title="Referrer" description="Record the page that sent the visitor." />
                  <ToggleRow v-model="settingsDraft.captureLanguage" title="Language" description="Capture browser language preferences." />
                  <ToggleRow v-model="settingsDraft.captureQueryParameters" title="Extra query parameters" description="Keep campaign tags added to the tripwire URL." />
                  <ToggleRow v-model="settingsDraft.honourDoNotTrack" title="Honour DNT / GPC" description="Record only time and link when privacy signals are set." />
                </div>
                <p v-if="settingsDraft.captureLocation" class="tw-privacy-note">Approximate IP location is enriched through the configured geolocation provider. Disable this if the link's audience has not been informed.</p>
              </div>

              <div class="tw-form-section">
                <div class="tw-section-title"><span>Filtering & retention</span></div>
                <ToggleRow v-model="settingsDraft.ignoreBots" title="Ignore bots and link previews" description="Redirect them normally without counting an event." />
                <div class="tw-field-row">
                  <label class="tw-field"><span>Unique visitor window</span><select v-model.number="settingsDraft.deduplicateWindowMinutes"><option :value="0">Every trip is unique</option><option :value="15">15 minutes</option><option :value="60">1 hour</option><option :value="1440">24 hours</option><option :value="10080">7 days</option></select></label>
                  <label class="tw-field"><span>Keep events for</span><select v-model.number="settingsDraft.retentionDays"><option :value="7">7 days</option><option :value="30">30 days</option><option :value="90">90 days</option><option :value="365">1 year</option><option :value="3650">10 years</option></select></label>
                </div>
              </div>

              <div class="tw-form-section">
                <div class="tw-section-title"><span>Links</span><small>Existing tracking URLs stay stable</small></div>
                <div v-for="(target, index) in targetDraft" :key="target.id || `new-${index}`" class="tw-target-editor">
                  <span>{{ index + 1 }}</span>
                  <input v-model.trim="target.label" maxlength="120" type="text" placeholder="Label" />
                  <input v-model.trim="target.destinationUrl" type="url" placeholder="https://destination.example" />
                  <label class="tw-mini-switch"><input v-model="target.enabled" type="checkbox" /><i></i><span>{{ target.enabled ? 'Live' : 'Off' }}</span></label>
                  <button type="button" aria-label="Remove link" @click="removeTarget(index)">×</button>
                </div>
                <button class="tw-add-link" type="button" @click="addTarget">＋ Add another link</button>
              </div>

              <div class="tw-savebar">
                <span>{{ dirty ? 'Review and save your changes.' : 'Everything is up to date.' }}</span>
                <button class="tw-button tw-button--primary" type="button" :disabled="saving || !dirty" @click="saveSettings">{{ saving ? 'Saving…' : 'Save changes' }}</button>
              </div>
            </div>

            <aside class="tw-settings-side">
              <section class="tw-panel tw-discord-card">
                <span class="tw-discord-icon">◉</span><div><h3>Discord alerts</h3><p>Have KliveBot DM you when this tripwire is opened.</p></div>
                <ToggleRow v-model="settingsDraft.discordNotifications" title="Send notifications" description="One direct message per eligible trip." />
                <ToggleRow v-model="settingsDraft.discordIncludeSensitiveDetails" title="Include visitor details" description="Add IP, location, device and referrer to the DM." :disabled="!settingsDraft.discordNotifications" />
                <label class="tw-field"><span>Notification cooldown</span><select v-model.number="settingsDraft.notificationCooldownSeconds" :disabled="!settingsDraft.discordNotifications"><option :value="0">Every trip</option><option :value="60">At most once a minute</option><option :value="300">At most every 5 minutes</option><option :value="3600">At most hourly</option></select></label>
                <button class="tw-button tw-button--discord" type="button" :disabled="testingNotification" @click="testNotification">{{ testingNotification ? 'Sending…' : 'Send test notification' }}</button>
              </section>
              <section class="tw-panel tw-danger-card">
                <h3>Data controls</h3><p>Clear captured events but keep this tripwire and its links.</p>
                <button class="tw-button tw-button--danger" type="button" @click="clearEvents">Clear event history</button>
              </section>
            </aside>
          </section>
        </template>
      </main>

      <main v-else class="tw-welcome">
        <div class="tw-welcome-art"><span>⚡</span><i></i><i></i><i></i></div>
        <div class="tw-eyebrow">Redirect intelligence</div>
        <h2>Know when your link lands.</h2>
        <p>Name a tripwire, add one or more destinations, and get shareable URLs that record an event before redirecting the visitor.</p>
        <button class="tw-button tw-button--primary" type="button" @click="openCreate">Create a tripwire</button>
      </main>
    </div>

    <Teleport to="body">
      <div v-if="createOpen" class="tw-modal-backdrop" @mousedown.self="closeCreate">
        <form class="tw-modal" data-testid="create-tripwire-modal" @submit.prevent="createTripwire">
          <div class="tw-modal-head"><div><span class="tw-bolt-tile">⚡</span><div><h2>New tripwire</h2><p>Every destination becomes a separate tracked link.</p></div></div><button type="button" aria-label="Close" @click="closeCreate">×</button></div>
          <div class="tw-modal-body">
            <label class="tw-field"><span>Tripwire name</span><input ref="nameInput" v-model.trim="createForm.name" maxlength="120" type="text" placeholder="e.g. Proposal sent to Acme" required /></label>
            <div class="tw-section-title"><span>Destinations</span><small>{{ createForm.targets.length }}/100</small></div>
            <div v-for="(target, index) in createForm.targets" :key="index" class="tw-create-target">
              <span>{{ index + 1 }}</span>
              <div><input v-model.trim="target.label" maxlength="120" type="text" placeholder="Label (optional)" /><input v-model.trim="target.destinationUrl" type="url" placeholder="https://example.com/your-page" required /></div>
              <button v-if="createForm.targets.length > 1" type="button" aria-label="Remove destination" @click="createForm.targets.splice(index, 1)">×</button>
            </div>
            <button class="tw-add-link" type="button" @click="createForm.targets.push(blankTarget())">＋ Add another destination</button>
            <div class="tw-quick-settings">
              <ToggleRow v-model="createForm.settings.discordNotifications" title="Discord alerts" description="KliveBot DMs you when a link trips." />
              <ToggleRow v-model="createForm.settings.captureLocation" title="Approximate location" description="Resolve country, region and city." />
              <ToggleRow v-model="createForm.settings.ignoreBots" title="Ignore previews and bots" description="Recommended for clean results." />
            </div>
            <p class="tw-consent-note">Use tracking links only where you have a lawful basis and give visitors any notice required for IP and device analytics.</p>
          </div>
          <div class="tw-modal-foot"><button class="tw-button tw-button--ghost" type="button" @click="closeCreate">Cancel</button><button class="tw-button tw-button--primary" data-testid="create-submit" type="submit" :disabled="creating">{{ creating ? 'Creating…' : `Create ${createForm.targets.length} ${createForm.targets.length === 1 ? 'link' : 'links'}` }}</button></div>
        </form>
      </div>
    </Teleport>

    <Transition name="toast"><div v-if="toast" class="tw-toast"><span>✓</span>{{ toast }}</div></Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import Swal from 'sweetalert2';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

definePageMeta({ layout: 'navbar' });

interface Settings { enabled: boolean; captureIpAddress: boolean; captureLocation: boolean; captureUserAgent: boolean; captureDeviceDetails: boolean; captureReferrer: boolean; captureLanguage: boolean; captureQueryParameters: boolean; honourDoNotTrack: boolean; ignoreBots: boolean; discordNotifications: boolean; discordIncludeSensitiveDetails: boolean; notificationCooldownSeconds: number; deduplicateWindowMinutes: number; retentionDays: number; expiresUtc: string | null; maxTrips: number | null; redirectStatusCode: number }
interface Target { id: string; label: string; destinationUrl: string; enabled: boolean; tripCount: number; trackingUrl: string }
interface Tripwire { id: string; name: string; createdBy: string; createdUtc: string; updatedUtc: string; lastTrippedUtc: string | null; totalTrips: number; status: string; settings: Settings; targets: Target[] }
interface TripEvent { id: string; targetLabel: string; destinationUrl: string; trippedUtc: string; ipAddress: string | null; visitorHash: string | null; countryCode: string | null; country: string | null; region: string | null; city: string | null; latitude: number | null; longitude: number | null; timezone: string | null; userAgent: string | null; browser: string | null; operatingSystem: string | null; deviceType: string | null; referrer: string | null; language: string | null; queryParametersJson: string | null; doNotTrack: boolean; isBot: boolean; isUnique: boolean; discordNotified: boolean; notificationError: string | null }
interface Summary { totalTrips: number; uniqueTrips: number; tripsLast24Hours: number; tripsLast7Days: number; lastTrippedUtc: string | null; daily: { date: string; count: number }[]; countries: { value: string; count: number }[] }

const ToggleRow = defineComponent({
  name: 'ToggleRow', inheritAttrs: false,
  props: { modelValue: Boolean, title: String, description: String, disabled: Boolean },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('label', { class: ['tw-toggle-row', props.disabled && 'disabled'] }, [
      h('span', { class: 'tw-toggle-copy' }, [h('strong', props.title), h('small', props.description)]),
      h('input', { type: 'checkbox', checked: props.modelValue, disabled: props.disabled, onChange: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).checked) }),
      h('i', { class: 'tw-toggle-ui' }),
    ]);
  },
});

const defaultSettings = (): Settings => ({ enabled: true, captureIpAddress: true, captureLocation: true, captureUserAgent: true, captureDeviceDetails: true, captureReferrer: true, captureLanguage: true, captureQueryParameters: true, honourDoNotTrack: true, ignoreBots: true, discordNotifications: false, discordIncludeSensitiveDetails: true, notificationCooldownSeconds: 0, deduplicateWindowMinutes: 60, retentionDays: 90, expiresUtc: null, maxTrips: null, redirectStatusCode: 302 });
const blankTarget = () => ({ id: '', label: '', destinationUrl: '', enabled: true, tripCount: 0, trackingUrl: '' });
const tripwires = ref<Tripwire[]>([]);
const selectedId = ref('');
const selected = computed(() => tripwires.value.find(item => item.id === selectedId.value) ?? null);
const loading = ref(false); const eventsLoading = ref(false); const saving = ref(false); const creating = ref(false); const testingNotification = ref(false);
const error = ref(''); const search = ref(''); const activeTab = ref<'activity' | 'settings'>('activity'); const targetFilter = ref('');
const eventsPage = reactive<{ items: TripEvent[]; total: number; limit: number; offset: number }>({ items: [], total: 0, limit: 100, offset: 0 });
const expandedEventId = ref('');
const summary = ref<Summary | null>(null); const createOpen = ref(false); const nameInput = ref<HTMLInputElement | null>(null);
const copiedId = ref(''); const toast = ref(''); let toastTimer: ReturnType<typeof setTimeout> | null = null; let pollTimer: ReturnType<typeof setInterval> | null = null;
const settingsName = ref(''); const settingsDraft = reactive<Settings>(defaultSettings()); const targetDraft = ref<Target[]>([]); const baseline = ref(''); const expiresLocal = ref('');
const createForm = reactive({ name: '', targets: [blankTarget()], settings: defaultSettings() });
const optionalColumns = [{ key: 'location', label: 'Location' }, { key: 'ip', label: 'IP address' }, { key: 'device', label: 'Device' }, { key: 'referrer', label: 'Referrer' }];
const visibleColumns = ref(['location', 'ip', 'device', 'referrer']);

const filteredTripwires = computed(() => { const q = search.value.trim().toLowerCase(); return q ? tripwires.value.filter(item => item.name.toLowerCase().includes(q) || item.targets.some(target => target.label.toLowerCase().includes(q))) : tripwires.value; });
const draftSnapshot = computed(() => JSON.stringify({ name: settingsName.value, settings: { ...settingsDraft, expiresUtc: expiresLocal.value ? new Date(expiresLocal.value).toISOString() : null }, targets: targetDraft.value.map(({ id, label, destinationUrl, enabled }) => ({ id, label, destinationUrl, enabled })) }));
const dirty = computed(() => Boolean(selected.value) && draftSnapshot.value !== baseline.value);
const last24Trend = computed(() => summary.value?.tripsLast24Hours ? `${summary.value.tripsLast24Hours} recent events` : 'quiet right now');
const chartPoints = computed(() => { const counts = new Map((summary.value?.daily ?? []).map(x => [x.date, x.count])); const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (13 - i)); const date = localDateKey(d); return { date, count: counts.get(date) ?? 0, label: i % 2 === 0 ? d.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2) : '' }; }); const max = Math.max(1, ...days.map(d => d.count)); return days.map(day => ({ ...day, height: day.count ? Math.max(8, (day.count / max) * 100) : 2 })); });

async function apiJson(response: Response) { const text = await response.text(); if (!response.ok) { let message = text; try { message = JSON.parse(text); } catch {} throw new Error(String(message || `Request failed (${response.status})`)); } return text ? JSON.parse(text) : null; }
async function loadTripwires(preserveSelection = true) { loading.value = true; error.value = ''; try { const data = await apiJson(await RequestGETFromKliveAPI('/tripwires/list', false, false, { 'Cache-Control': 'no-cache' })); tripwires.value = Array.isArray(data) ? data : []; const stillExists = tripwires.value.some(item => item.id === selectedId.value); if (!preserveSelection || !stillExists) selectedId.value = tripwires.value[0]?.id ?? ''; if (selectedId.value) await loadSelectedData(); } catch (e: any) { error.value = e?.message ?? 'Unknown error'; } finally { loading.value = false; } }
async function loadSelectedData() { if (!selectedId.value) return; eventsPage.offset = 0; targetFilter.value = ''; syncDraft(); await Promise.all([loadEvents(), loadSummary()]); }
async function loadEvents() { if (!selectedId.value) return; eventsLoading.value = true; try { const query = new URLSearchParams({ id: selectedId.value, limit: String(eventsPage.limit), offset: String(eventsPage.offset) }); if (targetFilter.value) query.set('targetId', targetFilter.value); const data = await apiJson(await RequestGETFromKliveAPI(`/tripwires/events?${query}`, false, false, { 'Cache-Control': 'no-cache' })); Object.assign(eventsPage, data); } catch (e: any) { showToast(e?.message ?? 'Could not load events', false); } finally { eventsLoading.value = false; } }
async function loadSummary() { if (!selectedId.value) return; try { summary.value = await apiJson(await RequestGETFromKliveAPI(`/tripwires/summary?id=${encodeURIComponent(selectedId.value)}`, false, false, { 'Cache-Control': 'no-cache' })); } catch {} }
async function refreshSelectedRecord() { if (!selectedId.value || (activeTab.value === 'settings' && dirty.value)) return; try { const latest = await apiJson(await RequestGETFromKliveAPI(`/tripwires/get?id=${encodeURIComponent(selectedId.value)}`, false, false, { 'Cache-Control': 'no-cache' })); const index = tripwires.value.findIndex(item => item.id === selectedId.value); if (index >= 0) { tripwires.value[index] = latest; if (activeTab.value !== 'settings') syncDraft(); } } catch {} }
async function selectTripwire(id: string) { if (id === selectedId.value) return; selectedId.value = id; activeTab.value = 'activity'; await loadSelectedData(); }
function syncDraft() { if (!selected.value) return; settingsName.value = selected.value.name; Object.assign(settingsDraft, defaultSettings(), JSON.parse(JSON.stringify(selected.value.settings))); targetDraft.value = selected.value.targets.map(target => ({ ...target })); expiresLocal.value = selected.value.settings.expiresUtc ? toLocalInput(selected.value.settings.expiresUtc) : ''; nextTick(() => { baseline.value = draftSnapshot.value; }); }

function openCreate() { createForm.name = ''; createForm.targets.splice(0, createForm.targets.length, blankTarget()); Object.assign(createForm.settings, defaultSettings()); createOpen.value = true; nextTick(() => nameInput.value?.focus()); }
function closeCreate() { if (!creating.value) createOpen.value = false; }
async function createTripwire() { if (!createForm.name || createForm.targets.some(target => !target.destinationUrl)) return; creating.value = true; try { const created = await apiJson(await RequestPOSTFromKliveAPI('/tripwires/create', JSON.stringify(createForm), false, true)); tripwires.value.unshift(created); selectedId.value = created.id; createOpen.value = false; activeTab.value = 'activity'; syncDraft(); await Promise.all([loadEvents(), loadSummary()]); showToast(`${created.targets.length} live ${created.targets.length === 1 ? 'link' : 'links'} created`); } catch (e: any) { await alertError('Could not create tripwire', e?.message); } finally { creating.value = false; } }
async function saveSettings() { if (!selected.value || !settingsName.value || !targetDraft.value.length) return; saving.value = true; try { const payload = JSON.parse(draftSnapshot.value); payload.id = selected.value.id; payload.settings.maxTrips = Number(payload.settings.maxTrips) > 0 ? Number(payload.settings.maxTrips) : null; const updated = await apiJson(await RequestPOSTFromKliveAPI('/tripwires/update', JSON.stringify(payload), false, true)); const index = tripwires.value.findIndex(item => item.id === updated.id); if (index >= 0) tripwires.value[index] = updated; syncDraft(); showToast('Tripwire settings saved'); } catch (e: any) { await alertError('Could not save changes', e?.message); } finally { saving.value = false; } }
function addTarget() { if (targetDraft.value.length < 100) targetDraft.value.push(blankTarget() as Target); }
function removeTarget(index: number) { if (targetDraft.value.length > 1) targetDraft.value.splice(index, 1); }
async function deleteTripwire() { if (!selected.value) return; const answer = await confirmDialog('Delete this tripwire?', `“${selected.value.name}” and all captured events will be permanently deleted.`, 'Delete tripwire'); if (!answer) return; try { await apiJson(await RequestPOSTFromKliveAPI('/tripwires/delete', JSON.stringify({ id: selected.value.id }), false, true)); tripwires.value = tripwires.value.filter(item => item.id !== selectedId.value); selectedId.value = tripwires.value[0]?.id ?? ''; if (selectedId.value) await loadSelectedData(); showToast('Tripwire deleted'); } catch (e: any) { await alertError('Could not delete tripwire', e?.message); } }
async function clearEvents() { if (!selected.value) return; const answer = await confirmDialog('Clear event history?', 'The links will remain active, but all existing trip records and counters will be permanently removed.', 'Clear history'); if (!answer) return; try { await apiJson(await RequestPOSTFromKliveAPI('/tripwires/events/clear', JSON.stringify({ id: selected.value.id }), false, true)); selected.value.totalTrips = 0; selected.value.lastTrippedUtc = null; selected.value.targets.forEach(target => target.tripCount = 0); await Promise.all([loadEvents(), loadSummary()]); showToast('Event history cleared'); } catch (e: any) { await alertError('Could not clear events', e?.message); } }
async function testNotification() { if (!selected.value) return; testingNotification.value = true; try { await apiJson(await RequestPOSTFromKliveAPI('/tripwires/notification/test', JSON.stringify({ id: selected.value.id }), false, true)); showToast('Test notification sent to Discord'); } catch (e: any) { await alertError('Discord test failed', e?.message); } finally { testingNotification.value = false; } }

async function copyLink(value: string, id: string) { try { await navigator.clipboard.writeText(value); copiedId.value = id; showToast('Tracking link copied'); setTimeout(() => { if (copiedId.value === id) copiedId.value = ''; }, 1600); } catch { await alertError('Copy failed', 'Your browser did not allow clipboard access.'); } }
async function copyAllLinks() { if (!selected.value) return; await copyLink(selected.value.targets.filter(target => target.enabled).map(target => `${target.label}: ${target.trackingUrl}`).join('\n'), '__all'); }
function changePage(direction: number) { eventsPage.offset = Math.max(0, eventsPage.offset + direction * eventsPage.limit); loadEvents(); }
function hasColumn(key: string) { return visibleColumns.value.includes(key); }
function statusClass(status: string) { return status.toLowerCase().replace(/\s+/g, '-'); }
function percentOf(value: number, total: number) { return total ? Math.max(4, Math.round(value / total * 100)) : 0; }
function eventLocation(event: TripEvent) { return [event.city, event.region, event.country || event.countryCode].filter(Boolean).join(', ') || 'Unknown / not collected'; }
function privacyLabel(event: TripEvent) { return event.doNotTrack ? 'DNT honoured' : 'Not collected'; }
function prettyQuery(value: string | null) { if (!value) return 'None / not collected'; try { return JSON.stringify(JSON.parse(value), null, 2); } catch { return value; } }
function formatDate(value: string) { return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); }
function formatTime(value: string) { return new Date(value).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }); }
function relativeTime(value: string | null | undefined) { if (!value) return 'Never'; const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000); if (seconds < 10) return 'Just now'; if (seconds < 60) return `${seconds}s ago`; if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`; if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`; return `${Math.floor(seconds / 86400)}d ago`; }
function toLocalInput(value: string) { const date = new Date(value); const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000); return local.toISOString().slice(0, 16); }
function localDateKey(date: Date) { const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; }
function showToast(message: string, success = true) { toast.value = message; if (toastTimer) clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.value = '', success ? 2600 : 4200); }
async function alertError(title: string, text = 'Please try again.') { await Swal.fire({ icon: 'error', title, text, confirmButtonColor: '#62ce47', background: '#161616', color: '#fff' }); }
async function confirmDialog(title: string, text: string, confirmButtonText: string) { const result = await Swal.fire({ icon: 'warning', title, text, showCancelButton: true, confirmButtonText, confirmButtonColor: '#b94b55', cancelButtonColor: '#343434', background: '#161616', color: '#fff' }); return result.isConfirmed; }
function exportEvents() { const headers = ['Time', 'Link', 'Destination', 'IP', 'Country', 'Region', 'City', 'Device', 'OS', 'Browser', 'Referrer', 'Unique', 'Discord notified']; const cell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`; const rows = eventsPage.items.map(event => [event.trippedUtc, event.targetLabel, event.destinationUrl, event.ipAddress, event.country, event.region, event.city, event.deviceType, event.operatingSystem, event.browser, event.referrer, event.isUnique, event.discordNotified].map(cell).join(',')); const blob = new Blob([[headers.map(cell).join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${selected.value?.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'tripwire'}-events.csv`; anchor.click(); URL.revokeObjectURL(url); }

watch(selectedId, () => { if (selected.value) syncDraft(); });
watch(activeTab, tab => { if (tab === 'activity') void Promise.all([loadEvents(), loadSummary()]); });
onMounted(() => { const stored = localStorage.getItem('tripwireColumns'); if (stored) { try { visibleColumns.value = JSON.parse(stored); } catch {} } loadTripwires(false); pollTimer = setInterval(async () => { if (!selectedId.value || document.hidden) return; await Promise.all([loadEvents(), loadSummary(), refreshSelectedRecord()]); }, 15000); });
watch(visibleColumns, value => localStorage.setItem('tripwireColumns', JSON.stringify(value)), { deep: true });
onBeforeUnmount(() => { if (pollTimer) clearInterval(pollTimer); if (toastTimer) clearTimeout(toastTimer); });
</script>

<style scoped lang="scss">
@use '~/assets/scss/colors' as c;

* { box-sizing: border-box; }
.tw-page { min-height: 100vh; background: #111211; color: #f5f7f4; font-family: inherit; }
.tw-topbar { min-height: 128px; padding: 26px 32px 22px; display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; border-bottom: 1px solid rgba(255,255,255,.07); background: radial-gradient(circle at 15% -60%, rgba(98,206,71,.14), transparent 42%), #151615; }
.tw-topbar h1 { margin: 4px 0 3px; font-size: clamp(25px, 3vw, 34px); letter-spacing: -.04em; }
.tw-topbar p, .tw-panel-head p, .tw-hero p { margin: 0; color: #7f877f; font-size: 12px; }
.tw-eyebrow { color: #72d85a; font-size: 10px; font-weight: 700; letter-spacing: .16em; text-transform: uppercase; }
.tw-live-dot { display: inline-block; width: 6px; height: 6px; margin-right: 6px; border-radius: 50%; background: #72d85a; box-shadow: 0 0 10px #72d85a; }
.tw-top-actions, .tw-hero-actions, .tw-event-actions { display: flex; align-items: center; gap: 8px; }
.tw-button, .tw-small-button, .tw-icon-button { border: 1px solid rgba(255,255,255,.1); border-radius: 6px; background: #202220; color: #dce1db; font: inherit; font-size: 12px; font-weight: 650; cursor: pointer; transition: .16s ease; }
.tw-button { min-height: 38px; padding: 0 15px; }
.tw-small-button { min-height: 30px; padding: 0 10px; }
.tw-button:hover, .tw-small-button:hover, .tw-icon-button:hover { border-color: rgba(98,206,71,.55); color: #fff; transform: translateY(-1px); }
.tw-button:disabled, .tw-small-button:disabled { opacity: .45; cursor: not-allowed; transform: none; }
.tw-button--primary { background: #62ce47; border-color: #62ce47; color: #091007; box-shadow: 0 6px 18px rgba(70,170,48,.14); }
.tw-button--primary:hover { background: #71db59; color: #091007; }
.tw-button--ghost { background: transparent; }
.tw-button--danger { color: #ff8d95; border-color: rgba(220,80,90,.3); background: rgba(160,48,58,.09); }
.tw-button--discord { width: 100%; margin-top: 12px; color: #daddff; border-color: rgba(114,127,255,.35); background: rgba(88,101,242,.13); }
.tw-workspace { display: grid; grid-template-columns: 260px minmax(0, 1fr); min-height: calc(100vh - 128px); }
.tw-sidebar { border-right: 1px solid rgba(255,255,255,.07); padding: 16px 12px; background: #141514; }
.tw-search-wrap { height: 36px; display: flex; align-items: center; gap: 8px; padding: 0 10px; margin-bottom: 12px; border: 1px solid rgba(255,255,255,.08); border-radius: 6px; background: rgba(255,255,255,.025); color: #747a74; }
.tw-search { width: 100%; border: 0; outline: 0; background: transparent; color: #fff; font: inherit; font-size: 12px; }
.tw-list-card { width: 100%; min-height: 65px; display: flex; align-items: center; gap: 10px; padding: 10px; margin-bottom: 5px; text-align: left; border: 1px solid transparent; border-radius: 7px; background: transparent; color: #dde1dc; cursor: pointer; }
.tw-list-card:hover { background: rgba(255,255,255,.035); }.tw-list-card.active { border-color: rgba(98,206,71,.25); background: linear-gradient(90deg, rgba(98,206,71,.13), rgba(98,206,71,.035)); }
.tw-list-bolt { width: 29px; height: 29px; display: grid; place-items: center; border-radius: 6px; background: #222622; color: #6ed054; font-size: 13px; }
.tw-list-copy { min-width: 0; flex: 1; display: grid; gap: 5px; }.tw-list-copy strong { overflow: hidden; color: #edf1ec; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }.tw-list-copy small { color: #717871; font-size: 10px; }
.tw-status-dot { width: 7px; height: 7px; border-radius: 50%; background: #666; }.tw-status-dot.active { background: #62ce47; box-shadow: 0 0 8px rgba(98,206,71,.7); }.tw-status-dot.expired,.tw-status-dot.limit-reached,.tw-status-dot.disabled { background: #e2964b; }
.tw-main { min-width: 0; padding: 24px 28px 50px; overflow: hidden; }
.tw-hero { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 19px; }.tw-hero-title { display: flex; align-items: center; gap: 13px; }.tw-bolt-tile { width: 39px; height: 39px; flex: 0 0 auto; display: grid; place-items: center; border: 1px solid rgba(98,206,71,.25); border-radius: 8px; background: rgba(98,206,71,.1); color: #70d657; }.tw-title-line { display: flex; align-items: center; gap: 10px; }.tw-title-line h2 { margin: 0 0 3px; font-size: 21px; letter-spacing: -.02em; }
.tw-status-pill { padding: 3px 7px; border-radius: 10px; background: rgba(120,120,120,.12); color: #a5aaa5; font-size: 9px; font-weight: 700; text-transform: uppercase; }.tw-status-pill.active { background: rgba(98,206,71,.13); color: #78da61; }.tw-status-pill.disabled,.tw-status-pill.expired,.tw-status-pill.limit-reached { background: rgba(226,150,75,.12); color: #efa556; }
.tw-icon-button { width: 34px; height: 34px; }.tw-icon-button--danger:hover { border-color: rgba(255,100,110,.5); color: #ff8e96; }
.tw-metrics { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 9px; margin-bottom: 12px; }.tw-metrics article { min-width: 0; padding: 15px 16px; border: 1px solid rgba(255,255,255,.07); border-radius: 7px; background: #181a18; }.tw-metrics small { display: block; color: #7d837d; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; }.tw-metrics strong { display: block; margin: 7px 0 4px; color: #f5f7f4; font-size: 24px; line-height: 1; letter-spacing: -.04em; }.tw-metrics span { color: #626862; font-size: 10px; }.tw-metrics .tw-metric-time { font-size: 17px; margin-top: 10px; }
.tw-panel { border: 1px solid rgba(255,255,255,.075); border-radius: 8px; background: #181a18; }.tw-panel-head { min-height: 60px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 13px 15px; border-bottom: 1px solid rgba(255,255,255,.06); }.tw-panel-head h3 { margin: 0 0 4px; font-size: 13px; }.tw-panel-head > strong { font-size: 20px; }.tw-panel-head > strong small { color: #6e756e; font-size: 9px; font-weight: 500; }
.tw-links-panel { margin-bottom: 18px; }.tw-link-row { min-height: 56px; display: grid; grid-template-columns: 14px minmax(140px,1.1fr) minmax(210px,1.5fr) 72px 68px; align-items: center; gap: 12px; padding: 10px 14px; border-bottom: 1px solid rgba(255,255,255,.045); }.tw-link-row:last-child { border-bottom: 0; }.tw-link-row.muted { opacity: .55; }.tw-link-state span { display: block; width: 6px; height: 6px; border-radius: 50%; background: #555; }.tw-link-state span.active { background: #62ce47; }.tw-link-detail { display: grid; min-width: 0; gap: 4px; }.tw-link-detail strong { font-size: 11px; }.tw-link-detail a { color: #6f766f; overflow: hidden; font-size: 10px; text-decoration: none; text-overflow: ellipsis; white-space: nowrap; }.tw-link-detail a:hover { color: #8edc7b; }.tw-link-row code { overflow: hidden; padding: 6px 8px; border: 1px solid rgba(98,206,71,.12); border-radius: 4px; background: #121412; color: #82c873; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }.tw-link-count { color: #777e77; font-size: 10px; text-align: right; }.tw-copy { padding: 6px; border: 0; background: transparent; color: #8fd37f; font: inherit; font-size: 10px; cursor: pointer; }
.tw-tabs { display: flex; gap: 4px; margin: 0 0 10px; border-bottom: 1px solid rgba(255,255,255,.07); }.tw-tabs button { padding: 10px 14px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #707770; font: inherit; font-size: 11px; font-weight: 650; cursor: pointer; }.tw-tabs button.active { border-bottom-color: #62ce47; color: #fff; }.tw-tabs span { margin-left: 4px; padding: 1px 5px; border-radius: 8px; background: rgba(255,255,255,.06); font-size: 9px; }
.tw-activity-grid { display: grid; grid-template-columns: 1.7fr 1fr; gap: 10px; margin-bottom: 10px; }.tw-chart { height: 155px; display: flex; align-items: flex-end; gap: 5px; padding: 24px 16px 13px; }.tw-bar-slot { position: relative; height: 100%; flex: 1; display: flex; align-items: flex-end; justify-content: center; }.tw-bar-slot i { width: 70%; min-height: 2px; border-radius: 3px 3px 1px 1px; background: linear-gradient(#70d257,#3d862f); opacity: .8; transition: height .3s ease; }.tw-bar-slot small { position: absolute; bottom: -13px; color: #535953; font-size: 8px; }.tw-bar-value { position: absolute; bottom: calc(var(--height) + 4px); color: #8b928b; font-size: 8px; transform: translateY(-4px); }.tw-breakdown-list { display: grid; gap: 13px; padding: 18px 15px; }.tw-breakdown-list > div { display: grid; grid-template-columns: 90px 1fr 28px; align-items: center; gap: 8px; font-size: 10px; }.tw-breakdown-list i { height: 4px; overflow: hidden; border-radius: 2px; background: rgba(255,255,255,.05); }.tw-breakdown-list b { display: block; height: 100%; border-radius: 2px; background: #5cbd46; }.tw-breakdown-list strong { text-align: right; }.tw-no-data { padding: 30px 15px; color: #686f68; font-size: 11px; text-align: center; }
.tw-events-head { align-items: flex-start; }.tw-select, .tw-field input, .tw-field select { height: 34px; border: 1px solid rgba(255,255,255,.09); border-radius: 5px; outline: 0; background: #111311; color: #dce1db; font: inherit; font-size: 11px; }.tw-select { padding: 0 8px; }.tw-columns { position: relative; }.tw-columns summary { min-height: 30px; display: grid; place-items: center; padding: 0 10px; border: 1px solid rgba(255,255,255,.1); border-radius: 5px; color: #dce1db; font-size: 10px; cursor: pointer; list-style: none; }.tw-columns[open] { z-index: 5; }.tw-columns[open] summary { border-color: rgba(98,206,71,.4); }.tw-columns label { width: 150px; display: block; padding: 6px 10px; background: #202220; color: #b7bdb7; font-size: 10px; }.tw-columns label:first-of-type { position: absolute; top: 34px; right: 0; padding-top: 10px; border-radius: 6px 6px 0 0; }.tw-columns label:nth-of-type(2) { position: absolute; top: 62px; right: 0; }.tw-columns label:nth-of-type(3) { position: absolute; top: 86px; right: 0; }.tw-columns label:nth-of-type(4) { position: absolute; top: 110px; right: 0; padding-bottom: 10px; border-radius: 0 0 6px 6px; }
.tw-table-wrap { overflow-x: auto; }table { width: 100%; border-collapse: collapse; table-layout: fixed; }th { padding: 9px 12px; color: #616861; font-size: 8px; letter-spacing: .1em; text-align: left; text-transform: uppercase; }td { padding: 11px 12px; border-top: 1px solid rgba(255,255,255,.045); color: #bfc5bf; font-size: 10px; vertical-align: middle; }td strong,td small { display: block; }td strong { margin-bottom: 4px; color: #e0e4df; font-size: 10px; }td small { color: #666d66; font-size: 9px; }td code { color: #a6cfa0; font-size: 9px; }.tw-truncate { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.tw-flags { display: flex; flex-wrap: wrap; gap: 3px; }.tw-flags span { padding: 2px 5px; border-radius: 7px; background: rgba(255,255,255,.06); color: #8b928b; font-size: 8px; }.tw-flags .unique { background: rgba(98,206,71,.12); color: #79d864; }.tw-flags .discord { background: rgba(88,101,242,.15); color: #aeb5ff; }.tw-event-empty { padding: 44px 20px; text-align: center; }.tw-event-empty > span { color: #4c9f3a; font-size: 26px; }.tw-event-empty h4 { margin: 8px 0 5px; }.tw-event-empty p { margin: 0; color: #697069; font-size: 11px; }.tw-table-loading { padding: 38px; color: #7d847d; font-size: 11px; text-align: center; }.tw-pagination { display: flex; justify-content: flex-end; align-items: center; gap: 12px; padding: 10px 14px; border-top: 1px solid rgba(255,255,255,.05); color: #6f766f; font-size: 9px; }.tw-pagination button { border: 0; background: none; color: #8ed67c; cursor: pointer; }.tw-pagination button:disabled { color: #4b504b; cursor: not-allowed; }
.tw-flags button { padding: 1px 3px; border: 0; background: none; color: #79c96a; font: inherit; font-size: 8px; cursor: pointer; }
.tw-detail-row td { padding: 0 12px 12px; background: rgba(0,0,0,.12); }
.tw-event-detail { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 10px; padding: 12px; border: 1px solid rgba(98,206,71,.1); border-radius: 6px; background: #121412; }
.tw-event-detail > div { min-width: 0; }.tw-event-detail .wide { grid-column: span 2; }.tw-event-detail small { display: block; margin-bottom: 5px; color: #5f675f; font-size: 8px; letter-spacing: .08em; text-transform: uppercase; }.tw-event-detail strong,.tw-event-detail code { display: block; overflow: auto; color: #cbd1ca; font-size: 9px; white-space: pre-wrap; word-break: break-word; }.tw-event-detail .error strong { color: #ef8d95; }
.tw-settings-grid { display: grid; grid-template-columns: minmax(0,1fr) 280px; align-items: start; gap: 10px; }.tw-settings-main { overflow: hidden; }.tw-form-section { padding: 16px; border-bottom: 1px solid rgba(255,255,255,.055); }.tw-section-title { display: flex; justify-content: space-between; margin-bottom: 12px; color: #dfe4de; font-size: 11px; font-weight: 700; }.tw-section-title small { color: #676e67; font-size: 9px; font-weight: 400; }.tw-field { display: grid; gap: 6px; color: #858c85; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; }.tw-field input,.tw-field select { width: 100%; padding: 0 10px; text-transform: none; letter-spacing: normal; }.tw-field input:focus,.tw-field select:focus { border-color: rgba(98,206,71,.5); }.tw-field-row { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-top: 14px; }.tw-toggle-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 7px; }.tw-toggle-row { min-height: 52px; display: flex; align-items: center; gap: 10px; padding: 9px 10px; border: 1px solid rgba(255,255,255,.06); border-radius: 6px; background: rgba(255,255,255,.018); cursor: pointer; }.tw-toggle-row.disabled { opacity: .42; cursor: not-allowed; }.tw-toggle-copy { min-width: 0; flex: 1; display: grid; gap: 3px; }.tw-toggle-copy strong { color: #d8ddd8; font-size: 10px; }.tw-toggle-copy small { color: #686f68; font-size: 9px; line-height: 1.35; }.tw-toggle-row input { position: absolute; opacity: 0; pointer-events: none; }.tw-toggle-ui { width: 29px; height: 16px; flex: 0 0 auto; position: relative; border-radius: 10px; background: #373a37; transition: .15s; }.tw-toggle-ui::after { content: ''; position: absolute; top: 3px; left: 3px; width: 10px; height: 10px; border-radius: 50%; background: #8d938d; transition: .15s; }.tw-toggle-row input:checked + .tw-toggle-ui { background: #4ea33b; }.tw-toggle-row input:checked + .tw-toggle-ui::after { left: 16px; background: #fff; }.tw-privacy-note,.tw-consent-note { margin: 10px 0 0; padding: 8px 10px; border-left: 2px solid #ad803a; background: rgba(173,128,58,.07); color: #8d8170; font-size: 9px; line-height: 1.45; }
.tw-target-editor { display: grid; grid-template-columns: 20px 150px minmax(180px,1fr) 62px 24px; gap: 7px; align-items: center; margin-bottom: 7px; }.tw-target-editor > span,.tw-create-target > span { color: #5e655e; font-size: 9px; text-align: center; }.tw-target-editor > input,.tw-create-target input { height: 34px; min-width: 0; padding: 0 9px; border: 1px solid rgba(255,255,255,.08); border-radius: 5px; outline: none; background: #111311; color: #dce1dc; font: inherit; font-size: 10px; }.tw-target-editor > input:focus,.tw-create-target input:focus { border-color: rgba(98,206,71,.5); }.tw-target-editor > button,.tw-create-target > button { border: 0; background: none; color: #a05c63; cursor: pointer; font-size: 17px; }.tw-mini-switch { display: flex; align-items: center; gap: 4px; color: #777e77; font-size: 8px; cursor: pointer; }.tw-mini-switch input { display: none; }.tw-mini-switch i { width: 22px; height: 12px; position: relative; border-radius: 8px; background: #353835; }.tw-mini-switch i::after { content:''; position:absolute; width:8px;height:8px;left:2px;top:2px;border-radius:50%;background:#8a908a; }.tw-mini-switch input:checked + i { background:#438c34; }.tw-mini-switch input:checked + i::after { left:12px;background:#fff; }.tw-add-link { padding: 4px 0; border: 0; background: transparent; color: #7dcf69; font: inherit; font-size: 10px; cursor: pointer; }.tw-savebar { position: sticky; bottom: 0; display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; background: rgba(20,22,20,.96); color: #747b74; font-size: 10px; backdrop-filter: blur(8px); }.tw-unsaved { color: #e8ac5d; font-size: 9px; }
.tw-settings-side { display: grid; gap: 10px; }.tw-discord-card,.tw-danger-card { padding: 15px; }.tw-discord-card > div { margin: -31px 0 14px 42px; }.tw-discord-icon { width: 31px; height: 31px; display: grid; place-items: center; border-radius: 8px; background: rgba(88,101,242,.16); color: #aab1ff; }.tw-discord-card h3,.tw-danger-card h3 { margin: 0 0 4px; font-size: 12px; }.tw-discord-card p,.tw-danger-card p { margin: 0; color: #707770; font-size: 9px; line-height: 1.45; }.tw-discord-card .tw-toggle-row { margin-bottom: 7px; }.tw-discord-card .tw-field { margin-top: 10px; }.tw-danger-card { border-color: rgba(180,65,75,.18); }.tw-danger-card .tw-button { width: 100%; margin-top: 13px; }
.tw-welcome,.tw-error-state { display: grid; place-items: center; align-content: center; padding: 40px; text-align: center; }.tw-welcome h2 { margin: 9px 0 8px; font-size: 28px; letter-spacing: -.04em; }.tw-welcome > p { max-width: 500px; margin: 0 0 20px; color: #747b74; font-size: 12px; line-height: 1.7; }.tw-welcome-art { width: 150px; height: 100px; position: relative; display: grid; place-items: center; margin-bottom: 20px; }.tw-welcome-art span { width: 55px;height:55px;display:grid;place-items:center;border:1px solid rgba(98,206,71,.35);border-radius:50%;background:rgba(98,206,71,.09);color:#6bd252;font-size:22px;box-shadow:0 0 40px rgba(98,206,71,.12); }.tw-welcome-art i { position:absolute;width:5px;height:5px;border-radius:50%;background:#508d44; }.tw-welcome-art i:nth-of-type(1){left:10px;top:24px}.tw-welcome-art i:nth-of-type(2){right:6px;top:42px}.tw-welcome-art i:nth-of-type(3){left:35px;bottom:2px}.tw-empty-list { padding: 32px 10px; color: #666d66; font-size: 11px; text-align: center; }.tw-empty-list > span { color: #4c8840; font-size: 20px; }.tw-empty-list button { border: 0; background: none; color: #72cc5d; cursor: pointer; }.tw-error-state { min-height: calc(100vh - 128px); }.tw-error-state > span { width: 38px;height:38px;display:grid;place-items:center;border-radius:50%;background:rgba(210,80,90,.12);color:#ff8d95 }.tw-error-state h2 { margin: 12px 0 4px; }.tw-error-state p { color:#858b85;font-size:11px; }
.tw-modal-backdrop { position: fixed; inset: 0; z-index: 3000; display: grid; place-items: center; padding: 20px; background: rgba(0,0,0,.72); backdrop-filter: blur(5px); }.tw-modal { width: min(620px,100%); max-height: calc(100vh - 40px); overflow: auto; border: 1px solid rgba(255,255,255,.1); border-radius: 10px; background: #181a18; color: #f4f6f3; box-shadow: 0 25px 80px rgba(0,0,0,.6); }.tw-modal-head,.tw-modal-foot { display:flex;align-items:center;justify-content:space-between;padding:15px 17px;border-bottom:1px solid rgba(255,255,255,.065); }.tw-modal-head > div { display:flex;align-items:center;gap:11px; }.tw-modal-head h2 { margin:0 0 3px;font-size:17px }.tw-modal-head p { margin:0;color:#707770;font-size:10px }.tw-modal-head > button { border:0;background:none;color:#777;font-size:21px;cursor:pointer }.tw-modal-body { display:grid;gap:15px;padding:18px }.tw-create-target { display:grid;grid-template-columns:20px 1fr 22px;gap:7px;align-items:center }.tw-create-target > div { display:grid;grid-template-columns:150px minmax(0,1fr);gap:7px }.tw-quick-settings { display:grid;grid-template-columns:repeat(3,1fr);gap:7px;padding-top:3px }.tw-modal-foot { justify-content:flex-end;gap:8px;border-top:1px solid rgba(255,255,255,.065);border-bottom:0 }.tw-consent-note { margin:0; }
.tw-toast { position:fixed;right:22px;bottom:22px;z-index:4000;display:flex;align-items:center;gap:9px;padding:10px 14px;border:1px solid rgba(98,206,71,.25);border-radius:7px;background:#202420;color:#e5ebe3;font-size:11px;box-shadow:0 12px 35px rgba(0,0,0,.45) }.tw-toast span { color:#6ed055 }.toast-enter-active,.toast-leave-active{transition:.2s}.toast-enter-from,.toast-leave-to{opacity:0;transform:translateY(8px)}.spin{display:inline-block;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}
.tw-skeleton-card { height:65px;margin-bottom:5px;border-radius:7px;background:linear-gradient(90deg,#1a1c1a,#202320,#1a1c1a);background-size:200% 100%;animation:shimmer 1.3s infinite}@keyframes shimmer{to{background-position:-200% 0}}
@media(max-width:1100px){.tw-workspace{grid-template-columns:210px minmax(0,1fr)}.tw-metrics{grid-template-columns:repeat(2,1fr)}.tw-link-row{grid-template-columns:14px minmax(120px,1fr) minmax(170px,1.2fr) 60px}.tw-link-count{display:none}.tw-settings-grid{grid-template-columns:1fr}.tw-settings-side{grid-template-columns:1fr 1fr}.tw-activity-grid{grid-template-columns:1fr}.tw-field-row{grid-template-columns:1fr 1fr}.tw-target-editor{grid-template-columns:20px 120px minmax(150px,1fr) 62px 24px}}
@media(max-width:760px){.tw-topbar{padding:20px;align-items:flex-start;flex-direction:column}.tw-workspace{display:block}.tw-sidebar{border-right:0;border-bottom:1px solid rgba(255,255,255,.07);max-height:250px;overflow:auto}.tw-main{padding:18px 14px 40px}.tw-link-row{grid-template-columns:12px 1fr 58px}.tw-link-row code{grid-column:2/4}.tw-metrics{grid-template-columns:1fr 1fr}.tw-event-actions{align-items:stretch;flex-wrap:wrap}.tw-toggle-grid,.tw-quick-settings{grid-template-columns:1fr}.tw-field-row{grid-template-columns:1fr}.tw-settings-side{grid-template-columns:1fr}.tw-target-editor{grid-template-columns:20px 1fr 55px 22px}.tw-target-editor>input:nth-of-type(2){grid-column:2/5}.tw-create-target>div{grid-template-columns:1fr}.tw-top-actions{width:100%}.tw-top-actions .tw-button{flex:1}}
</style>
