<template>
  <Teleport to="body">
    <div v-if="tripwire" class="twx-layer twx-scrim twx-scrim--side" @mousedown.self="close">
      <aside class="twx-sheet" role="dialog" aria-modal="true" aria-labelledby="twx-sheet-title" data-testid="twx-settings" @keydown.esc.prevent="close">
        <header class="twx-sheet__head">
          <div>
            <h2 id="twx-sheet-title">Settings</h2>
            <p class="twx-faint">{{ tripwire.name }} · changes apply to every link at once</p>
          </div>
          <button class="twx-iconbtn" aria-label="Close settings" @click="close"><TripwiresIcon name="x" /></button>
        </header>

        <div class="twx-sheet__body">
          <section class="twx-sect">
            <label class="twx-field"><span>Name</span><input v-model="name" maxlength="120" data-testid="settings-name" /></label>
            <TripwiresSwitch v-model="draft.enabled" title="Live" text="Off pauses every link without losing its history." testid="settings-live" />
          </section>

          <section class="twx-sect">
            <h3>Links <small class="twx-faint">tracking links never change</small></h3>
            <div v-for="(target, index) in links" :key="target.id || `new-${index}`" class="twx-dest twx-dest--edit">
              <span class="twx-dest__n twx-num">{{ index + 1 }}</span>
              <input v-model="target.destinationUrl" class="twx-dest__url" placeholder="https://destination.example" :aria-label="`Destination ${index + 1}`" />
              <input v-model="target.label" class="twx-dest__label" maxlength="120" placeholder="Label" :aria-label="`Label ${index + 1}`" />
              <label class="twx-pill-toggle" :title="target.enabled ? 'Live' : 'Off'"><input v-model="target.enabled" type="checkbox" /><span>{{ target.enabled ? 'Live' : 'Off' }}</span></label>
              <button class="twx-iconbtn" :disabled="links.length <= 1" :aria-label="`Remove link ${index + 1}`" @click="links.splice(index, 1)"><TripwiresIcon name="trash" /></button>
              <small v-if="target.destinationUrl && !cleanUrl(target.destinationUrl)" class="twx-dest__err">Not a web address</small>
              <small v-if="!target.id" class="twx-dest__hint">New link: its tracking address is made when you save.</small>
            </div>
            <button class="twx-btn twx-btn--ghost twx-btn--sm" :disabled="links.length >= 100" @click="links.push({ id: '', label: '', destinationUrl: '', enabled: true })"><TripwiresIcon name="plus" />Add a link</button>
          </section>

          <section class="twx-sect">
            <h3>When it stops</h3>
            <div class="twx-grid2">
              <label class="twx-field"><span>Stop after</span><input v-model.number="maxTrips" type="number" min="1" placeholder="Unlimited trips" data-testid="settings-max" /></label>
              <label class="twx-field"><span>Expires</span><input v-model="expires" type="datetime-local" /></label>
              <label class="twx-field twx-grid2__wide">
                <span>Once it is paused, expired or full</span>
                <select v-model="draft.closedBehaviour" data-testid="settings-closed">
                  <option value="refuse">The link stops working ("This link is no longer available")</option>
                  <option value="redirect">Keep redirecting, record nothing</option>
                </select>
              </label>
            </div>
            <p v-if="(tripwire.closedVisits ?? 0) > 0" class="twx-note" data-tone="warn">{{ tripwire.closedVisits }} visit{{ tripwire.closedVisits === 1 ? ' has' : 's have' }} arrived while it was closed.</p>
          </section>

          <section class="twx-sect">
            <h3>What a trip keeps <small class="twx-faint">time and link are always kept</small></h3>
            <div class="twx-switches">
              <TripwiresSwitch v-model="draft.captureIpAddress" title="Address" text="The visitor's public IP." />
              <TripwiresSwitch v-model="draft.captureLocation" title="Approximate location" text="City and country from the address." />
              <TripwiresSwitch v-model="draft.captureDeviceDetails" title="Device" text="Browser, system and device type." />
              <TripwiresSwitch v-model="draft.captureUserAgent" title="Full user agent" />
              <TripwiresSwitch v-model="draft.captureReferrer" title="Where they came from" text="The page that sent them, when the browser says." />
              <TripwiresSwitch v-model="draft.captureLanguage" title="Language" />
              <TripwiresSwitch v-model="draft.captureQueryParameters" title="Extra parameters" text="Anything added to the link, such as ?src=email." />
              <TripwiresSwitch v-model="draft.honourDoNotTrack" title="Honour Do Not Track and GPC" :text="privacyText" testid="settings-dnt" />
              <TripwiresSwitch v-model="draft.ignoreBots" title="Ignore bots and link previews" text="Counted as previews, not as trips." />
            </div>
            <div class="twx-grid2">
              <label class="twx-field"><span>Same visitor counts once within</span>
                <select v-model.number="draft.deduplicateWindowMinutes"><option :value="0">Every trip is new</option><option :value="15">15 minutes</option><option :value="60">1 hour</option><option :value="1440">1 day</option><option :value="10080">7 days</option><option :value="43200">30 days</option></select>
              </label>
              <label class="twx-field"><span>Keep trips for</span>
                <select v-model.number="draft.retentionDays"><option :value="7">7 days</option><option :value="30">30 days</option><option :value="90">90 days</option><option :value="365">1 year</option><option :value="3650">10 years</option></select>
              </label>
              <label class="twx-field twx-grid2__wide"><span>Redirect</span>
                <select v-model.number="draft.redirectStatusCode"><option :value="302">302 temporary (recommended)</option><option :value="307">307 temporary, keeps the method</option><option :value="301">301 permanent (browsers may skip the tripwire next time)</option><option :value="308">308 permanent, keeps the method</option></select>
              </label>
            </div>
          </section>

          <section class="twx-sect">
            <h3><TripwiresIcon name="discord" />Discord</h3>
            <div class="twx-switches">
              <TripwiresSwitch v-model="draft.discordNotifications" title="Alert me" text="KliveBot sends you a message for each trip." testid="settings-discord" />
              <TripwiresSwitch v-model="draft.discordIncludeSensitiveDetails" :disabled="!draft.discordNotifications" title="Include visitor details" text="Address, location, network, device and referrer." />
              <TripwiresSwitch v-model="draft.discordSkipKnownProfiles" :disabled="!draft.discordNotifications" title="Not for KM accounts" text="No message when the address has signed in to KM (your own tests)." />
            </div>
            <label class="twx-field"><span>At most</span>
              <select v-model.number="draft.notificationCooldownSeconds" :disabled="!draft.discordNotifications"><option :value="0">Every trip</option><option :value="60">One a minute</option><option :value="300">One every 5 minutes</option><option :value="3600">One an hour</option><option :value="86400">One a day</option></select>
            </label>
            <button v-if="canTest" class="twx-btn twx-btn--sm" :disabled="testing" @click="test"><TripwiresIcon name="bell" />{{ testing ? 'Sending…' : 'Send a test alert' }}</button>
          </section>

          <section class="twx-sect twx-sect--danger">
            <h3>Data</h3>
            <div class="twx-row">
              <button class="twx-btn twx-btn--sm" data-testid="settings-clear" @click="emit('clear')"><TripwiresIcon name="history" />Clear history</button>
              <button class="twx-btn twx-btn--sm twx-btn--danger" data-testid="settings-delete" @click="emit('delete')"><TripwiresIcon name="trash" />Delete tripwire</button>
            </div>
          </section>
        </div>

        <footer class="twx-sheet__foot">
          <span :class="dirty ? 'twx-warnText' : 'twx-faint'">{{ invalid || (dirty ? 'Unsaved changes' : 'Everything is saved') }}</span>
          <button class="twx-btn twx-btn--ghost" @click="close">Close</button>
          <button class="twx-btn twx-btn--primary" :disabled="!dirty || !!invalid || saving" data-testid="settings-save" @click="save">{{ saving ? 'Saving…' : 'Save' }}</button>
        </footer>
      </aside>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { cleanUrl, normalizeSettings, type TwSettings, type TwTarget, type TwTripwire } from '~/scripts/tripwires';

const props = defineProps<{ tripwire: TwTripwire | null; canTest?: boolean; privacy?: { signalled: number; total: number } }>();
const emit = defineEmits<{
  close: []; clear: []; delete: []; test: [];
  save: [patch: { name: string; settings: TwSettings; targets: Partial<TwTarget>[] }, done: (ok: boolean) => void];
}>();

const name = ref('');
const draft = ref<TwSettings>(normalizeSettings(null));
const links = ref<{ id: string; label: string; destinationUrl: string; enabled: boolean }[]>([]);
const maxTrips = ref<number | null>(null);
const expires = ref('');
const baseline = ref('');
const saving = ref(false);
const testing = ref(false);

function toLocalInput(value: string | null) {
  if (!value) return '';
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const snapshot = computed(() => JSON.stringify({ name: name.value.trim(), draft: draft.value, links: links.value, maxTrips: maxTrips.value || null, expires: expires.value }));
const dirty = computed(() => baseline.value !== '' && snapshot.value !== baseline.value);
const invalid = computed(() => {
  if (!name.value.trim()) return 'A name is needed';
  if (!links.value.length) return 'Keep at least one link';
  if (links.value.some(l => !cleanUrl(l.destinationUrl))) return 'A link is not a web address';
  return '';
});
const privacyText = computed(() => {
  const p = props.privacy;
  return p && p.total >= 2
    ? `${p.signalled} of ${p.total} trips here sent it. When honoured, those keep only the time and link.`
    : 'When honoured, those visitors keep only the time and link.';
});

function load(t: TwTripwire | null) {
  if (!t) return;
  name.value = t.name;
  draft.value = normalizeSettings(JSON.parse(JSON.stringify(t.settings)));
  links.value = t.targets.map(x => ({ id: x.id, label: x.label, destinationUrl: x.destinationUrl, enabled: x.enabled }));
  maxTrips.value = t.settings.maxTrips;
  expires.value = toLocalInput(t.settings.expiresUtc);
  baseline.value = snapshot.value;
}

watch(() => props.tripwire?.id, () => load(props.tripwire), { immediate: true });

function close() {
  if (dirty.value && !window.confirm('Close without saving your changes?')) return;
  emit('close');
}

function save() {
  if (!props.tripwire || invalid.value) return;
  saving.value = true;
  const settings: TwSettings = { ...draft.value, maxTrips: maxTrips.value && maxTrips.value > 0 ? Math.floor(maxTrips.value) : null, expiresUtc: expires.value ? new Date(expires.value).toISOString() : null };
  emit('save', {
    name: name.value.trim(), settings,
    targets: links.value.map(l => ({ id: l.id || undefined, label: l.label.trim(), destinationUrl: cleanUrl(l.destinationUrl) ?? l.destinationUrl, enabled: l.enabled })),
  }, ok => {
    saving.value = false;
    // Reload from the saved tripwire: new links now have ids, so saving again keeps them instead of adding copies.
    if (ok) void nextTick(() => load(props.tripwire));
  });
}

async function test() {
  testing.value = true;
  emit('test');
  window.setTimeout(() => { testing.value = false; }, 1_500);
}

onMounted(() => { void nextTick(() => (document.querySelector('.twx-sheet [data-testid="settings-name"]') as HTMLInputElement | null)?.focus()); });

defineExpose({ reload: () => load(props.tripwire), close });
</script>
