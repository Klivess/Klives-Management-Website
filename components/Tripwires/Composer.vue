<template>
  <Teleport to="body">
    <div v-if="open" class="twx-layer twx-scrim" @mousedown.self="emit('close')">
      <form class="twx-dialog twx-composer" role="dialog" aria-modal="true" aria-labelledby="twx-composer-title" data-testid="twx-composer" @submit.prevent="submit" @keydown.esc.prevent="emit('close')">
        <header class="twx-dialog__head">
          <span class="twx-mark"><TripwiresIcon name="bolt" /></span>
          <div>
            <h2 id="twx-composer-title">New tripwire</h2>
            <p>Each destination gets its own tracking link.</p>
          </div>
          <button type="button" class="twx-iconbtn" aria-label="Close" @click="emit('close')"><TripwiresIcon name="x" /></button>
        </header>

        <div class="twx-dialog__body">
          <label class="twx-field">
            <span>Name</span>
            <input ref="nameInput" v-model="name" maxlength="120" :placeholder="suggestedName || 'e.g. Proposal sent to Acme'" data-testid="composer-name" />
          </label>

          <div class="twx-field">
            <span>Destinations <small class="twx-faint">{{ targets.length }}/100 · paste several links at once</small></span>
            <div v-for="(target, index) in targets" :key="index" class="twx-dest">
              <span class="twx-dest__n twx-num">{{ index + 1 }}</span>
              <input v-model="target.url" class="twx-dest__url" placeholder="https://example.com/your-page" :aria-label="`Destination ${index + 1}`" data-testid="composer-url" @paste="event => onPaste(event, index)" />
              <input v-model="target.label" class="twx-dest__label" maxlength="120" :placeholder="hostOf(cleanUrl(target.url) ?? '') || 'Label'" :aria-label="`Label ${index + 1}`" data-testid="composer-label" />
              <button v-if="targets.length > 1" type="button" class="twx-iconbtn" :aria-label="`Remove destination ${index + 1}`" @click="targets.splice(index, 1)"><TripwiresIcon name="x" /></button>
              <small v-if="target.url && !cleanUrl(target.url)" class="twx-dest__err">Not a web address</small>
            </div>
            <button type="button" class="twx-btn twx-btn--ghost twx-btn--sm" :disabled="targets.length >= 100" @click="targets.push({ url: '', label: '' })"><TripwiresIcon name="plus" />Another destination</button>
          </div>

          <label class="twx-field">
            <span>Start from</span>
            <select v-model="sourceId" data-testid="composer-source">
              <option value="">Default settings</option>
              <option v-for="t in tripwires" :key="t.id" :value="t.id">{{ t.name }}'s settings</option>
            </select>
          </label>

          <div class="twx-switches">
            <TripwiresSwitch v-model="settings.discordNotifications" title="Discord alert" text="KliveBot messages you when a link trips." />
            <TripwiresSwitch v-model="settings.honourDoNotTrack" title="Honour Do Not Track and GPC" testid="composer-dnt"
              :text="privacyText" />
            <TripwiresSwitch v-model="settings.ignoreBots" title="Ignore bots and link previews" text="Counted as previews, not as trips." />
            <TripwiresSwitch v-model="settings.captureLocation" title="Approximate location" text="City and country from the address." />
          </div>

          <details class="twx-more">
            <summary>Limits and expiry</summary>
            <div class="twx-grid2">
              <label class="twx-field"><span>Stop after</span><input v-model.number="maxTrips" type="number" min="1" placeholder="Unlimited trips" /></label>
              <label class="twx-field"><span>Expires</span><input v-model="expires" type="datetime-local" /></label>
              <label class="twx-field twx-grid2__wide">
                <span>Once it stops or expires</span>
                <select v-model="settings.closedBehaviour">
                  <option value="refuse">The link stops working</option>
                  <option value="redirect">Keep redirecting, record nothing</option>
                </select>
              </label>
            </div>
          </details>

          <p class="twx-note">Only use tracking links where you have a lawful basis, and give any notice the audience is owed.</p>
        </div>

        <footer class="twx-dialog__foot">
          <span class="twx-faint">Enter to create · Esc to close</span>
          <button type="button" class="twx-btn twx-btn--ghost" @click="emit('close')">Cancel</button>
          <button type="submit" class="twx-btn twx-btn--primary" :disabled="!canSubmit || busy" data-testid="composer-submit">
            {{ busy ? 'Creating…' : validTargets.length > 1 ? `Create ${validTargets.length} links` : 'Create link' }}
          </button>
        </footer>
      </form>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { cleanUrl, hostOf, lastEdited, nameFromUrl, settingsFrom, type TwSettings, type TwTripwire } from '~/scripts/tripwires';

/**
 * The full way to make a tripwire. It starts from the settings of the tripwire Klives edited last: on the
 * three tripwires he actually used, the first trip came back empty because Do Not Track was honoured by
 * default, and he switched it off each time. So the choice is on this form, with what it costs.
 */
const props = defineProps<{ open: boolean; tripwires: TwTripwire[]; busy?: boolean; initialUrl?: string; privacy?: { signalled: number; total: number } }>();
const emit = defineEmits<{ close: []; create: [payload: { name: string; targets: { label: string; destinationUrl: string }[]; settings: TwSettings }] }>();

const name = ref('');
const targets = ref<{ url: string; label: string }[]>([{ url: '', label: '' }]);
const sourceId = ref('');
const settings = ref<TwSettings>(settingsFrom(null));
const maxTrips = ref<number | null>(null);
const expires = ref('');
const nameInput = ref<HTMLInputElement | null>(null);

const validTargets = computed(() => targets.value.map(t => ({ url: cleanUrl(t.url), label: t.label.trim() })).filter(t => t.url));
const suggestedName = computed(() => (validTargets.value[0]?.url ? nameFromUrl(validTargets.value[0].url!) : ''));
const canSubmit = computed(() => validTargets.value.length > 0 && targets.value.every(t => !t.url.trim() || cleanUrl(t.url)));
const privacyText = computed(() => {
  const p = props.privacy;
  if (p && p.total >= 3) return `${p.signalled} of your last ${p.total} trips sent it. When honoured, those keep only the time and link.`;
  return 'When honoured, those visitors keep only the time and link.';
});

watch(sourceId, id => {
  const source = props.tripwires.find(t => t.id === id) ?? null;
  settings.value = settingsFrom(source);
});

watch(() => props.open, open => {
  if (!open) return;
  const last = lastEdited(props.tripwires);
  name.value = '';
  targets.value = [{ url: props.initialUrl ?? '', label: '' }];
  sourceId.value = last?.id ?? '';
  settings.value = settingsFrom(last);
  maxTrips.value = null;
  expires.value = '';
  void nextTick(() => nameInput.value?.focus());
}, { immediate: true });

function onPaste(event: ClipboardEvent, index: number) {
  const text = event.clipboardData?.getData('text') ?? '';
  const lines = text.split(/[\r\n\s]+/).map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return;
  event.preventDefault();
  const rows = lines.slice(0, 100 - targets.value.length + 1).map(url => ({ url, label: '' }));
  targets.value.splice(index, 1, ...rows);
}

function submit() {
  if (!canSubmit.value || props.busy) return;
  const out: TwSettings = { ...settings.value, maxTrips: maxTrips.value && maxTrips.value > 0 ? Math.floor(maxTrips.value) : null, expiresUtc: expires.value ? new Date(expires.value).toISOString() : null };
  emit('create', {
    name: name.value.trim() || suggestedName.value || 'New tripwire',
    targets: validTargets.value.map(t => ({ label: t.label, destinationUrl: t.url! })),
    settings: out,
  });
}
</script>
