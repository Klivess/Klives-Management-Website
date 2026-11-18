<template>
  <div class="dmx-set">
    <div v-if="loading" class="dmx-empty"><DemiurgeIcon name="refresh" class="dmx-spin" /><span>Loading settings…</span></div>
    <template v-else>
      <div v-if="loadError" class="dmx-banner" data-tone="fault" role="alert">
        <DemiurgeIcon name="alert" /><div class="dmx-banner__body"><b>These settings could not be loaded</b>{{ loadError }} Saving now would start from blank values.</div>
        <div class="dmx-banner__actions"><button class="dmx-btn dmx-btn--sm" @click="load">Retry</button></div>
      </div>
      <p v-if="system" class="dmx-dim dmx-set__note">System defaults: every new Steward starts from these. Changing them never touches an existing Steward.</p>

      <div class="dmx-set__grid">
        <section class="dmx-set__group" aria-label="Behaviour">
          <h4 class="dmx-gp__label">Behaviour</h4>
          <label class="dmx-toggle">
            <span class="dmx-toggle__copy"><b>Desktop computers</b><span>Agents get real desktops: mouse, keyboard, screen and a browser. Off for a text-only Steward.</span></span>
            <span class="dmx-switchbox"><input v-model="form.containersEnabled" type="checkbox" class="dmx-switchbox__input" aria-label="Desktop computers" /><span class="dmx-switch" :data-on="form.containersEnabled || undefined" aria-hidden="true"></span></span>
          </label>
          <div v-if="!system && form.containersEnabled" class="dmx-toggle dmx-set__field" style="cursor: default">
            <span class="dmx-toggle__copy"><b>Browser sign-ins</b><span>Shared puts every agent on one locked desktop, so one login is available to the whole Steward.</span></span>
            <select v-model="form.desktopAllocation" class="dmx-select" aria-label="Browser sign-ins">
              <option value="PerAgentContainers">Separate per agent</option>
              <option value="SharedDesktopWithInputLock">One shared session</option>
            </select>
          </div>
          <label class="dmx-toggle">
            <span class="dmx-toggle__copy"><b>Vision</b><span>Feed screenshots back to video-tier agents after desktop actions.</span></span>
            <span class="dmx-switchbox"><input v-model="form.visionEnabled" type="checkbox" class="dmx-switchbox__input" aria-label="Vision" /><span class="dmx-switch" :data-on="form.visionEnabled || undefined" aria-hidden="true"></span></span>
          </label>
          <label class="dmx-toggle">
            <span class="dmx-toggle__copy"><b>Live activity</b><span>Stream model output, so the conversation shows who is generating, and what.</span></span>
            <span class="dmx-switchbox"><input v-model="form.liveActivityStreaming" type="checkbox" class="dmx-switchbox__input" aria-label="Live activity" /><span class="dmx-switch" :data-on="form.liveActivityStreaming || undefined" aria-hidden="true"></span></span>
          </label>
          <label class="dmx-toggle">
            <span class="dmx-toggle__copy"><b>Instant chat replies</b><span>Answer your messages within seconds in the Commander's voice while it gets to them.</span></span>
            <span class="dmx-switchbox"><input v-model="form.instantRepliesEnabled" type="checkbox" class="dmx-switchbox__input" aria-label="Instant chat replies" /><span class="dmx-switch" :data-on="form.instantRepliesEnabled || undefined" aria-hidden="true"></span></span>
          </label>
          <label class="dmx-toggle">
            <span class="dmx-toggle__copy"><b>Keep working between wakes</b><span>A productive Commander with open steps continues within a minute instead of waiting for its next check-in.</span></span>
            <span class="dmx-switchbox"><input v-model="form.momentumEnabled" type="checkbox" class="dmx-switchbox__input" aria-label="Keep working between wakes" /><span class="dmx-switch" :data-on="form.momentumEnabled || undefined" aria-hidden="true"></span></span>
          </label>
          <div class="dmx-toggle dmx-set__field" style="cursor: default">
            <span class="dmx-toggle__copy"><b>Desktop image</b><span>The container image each computer starts from.</span></span>
            <input v-model="form.desktopImage" class="dmx-input dmx-mono dmx-set__image" aria-label="Desktop image" placeholder="omnipotent/demiurge-desktop:latest" />
          </div>
        </section>

        <section class="dmx-set__group" aria-label="Autonomy limits">
          <h4 class="dmx-gp__label">Autonomy limits</h4>
          <p class="dmx-dim dmx-set__hint">Hard limits enforced when an agent calls a tool, whatever it decides. Everything else stays with the agents' judgement and the approval rules.</p>
          <div class="dmx-set__domains">
            <div class="dmx-field">
              <label class="dmx-field__label" for="dmx-set-blocked">Never use these sites <span class="dmx-faint">· one host per line, subdomains included</span></label>
              <textarea id="dmx-set-blocked" v-model="form.blockedDomainsText" class="dmx-textarea dmx-mono" rows="3" placeholder="facebook.com" aria-label="Blocked sites"></textarea>
            </div>
            <div class="dmx-field">
              <label class="dmx-field__label" for="dmx-set-ask">Ask me first <span class="dmx-faint">· the first visit opens an approval; yes lasts 24 h</span></label>
              <textarea id="dmx-set-ask" v-model="form.askFirstDomainsText" class="dmx-textarea dmx-mono" rows="3" placeholder="paypal.com" aria-label="Ask-first sites"></textarea>
            </div>
          </div>
          <label class="dmx-toggle">
            <span class="dmx-toggle__copy"><b>Host shell and scripts</b><span>PowerShell, Bash and C# on Omnipotent's own machine. Off keeps agents inside their computers.</span></span>
            <span class="dmx-switchbox"><input v-model="form.allowHostShell" type="checkbox" class="dmx-switchbox__input" aria-label="Host shell and scripts" /><span class="dmx-switch" :data-on="form.allowHostShell || undefined" aria-hidden="true"></span></span>
          </label>
          <label class="dmx-toggle">
            <span class="dmx-toggle__copy"><b>Send email</b><span>Off: agents draft messages for you instead of sending them.</span></span>
            <span class="dmx-switchbox"><input v-model="form.allowOutboundEmail" type="checkbox" class="dmx-switchbox__input" aria-label="Send email" /><span class="dmx-switch" :data-on="form.allowOutboundEmail || undefined" aria-hidden="true"></span></span>
          </label>
          <label class="dmx-toggle">
            <span class="dmx-toggle__copy"><b>Create new accounts</b><span>Off: agents reuse registered accounts or ask you.</span></span>
            <span class="dmx-switchbox"><input v-model="form.allowAccountCreation" type="checkbox" class="dmx-switchbox__input" aria-label="Create new accounts" /><span class="dmx-switch" :data-on="form.allowAccountCreation || undefined" aria-hidden="true"></span></span>
          </label>
        </section>
      </div>

      <!-- Nine route lists are most of this form; each folds to the model it prefers, and opens to edit. -->
      <section class="dmx-set__group" aria-label="Model routing">
        <h4 class="dmx-gp__label">Model routing</h4>
        <p class="dmx-dim dmx-set__hint">Each list is isolated. The first model is preferred; failures advance down the list in exactly this order.</p>
        <ul class="dmx-set__routes">
          <li v-for="f in modelFields" :key="f.key" :data-open="openRoutes.has(f.key) || undefined">
            <button type="button" class="dmx-set__route" :aria-expanded="openRoutes.has(f.key)" @click="toggleRoute(f.key)">
              <span class="dmx-set__route-label">{{ f.label }}</span>
              <span class="dmx-mono dmx-truncate dmx-set__route-model">{{ form[f.key]?.[0] || 'no model' }}</span>
              <span v-if="(form[f.key]?.length ?? 0) > 1" class="dmx-faint dmx-set__route-more">+{{ form[f.key].length - 1 }} {{ form[f.key].length === 2 ? 'fallback' : 'fallbacks' }}</span>
              <span v-if="routeInvalid(f)" class="dmx-chip" data-tone="fault">needs a model</span>
              <span v-else-if="routeTuned(f)" class="dmx-chip dmx-chip--quiet" title="Has its own model parameters">tuned</span>
              <DemiurgeIcon name="chevron-down" class="dmx-set__caret" />
            </button>
            <div v-if="openRoutes.has(f.key)" class="ot-os dmx-embed dmx-set__route-body">
              <ModelRouteList
                v-model="form[f.key]"
                v-model:parameters="form.routeParameters[f.route]"
                :label="f.label"
                :placeholder="f.placeholder"
                :show-parameters="!f.parametersNote"
                :parameters-note="f.parametersNote ?? ''"
              />
            </div>
          </li>
        </ul>
      </section>

      <div class="dmx-set__actions">
        <button class="dmx-btn dmx-btn--primary dmx-btn--sm" :disabled="saving || !dirty || invalidRoutes" @click="save">{{ saving ? 'Saving…' : (dirty ? 'Save changes' : 'Saved') }}</button>
        <button class="dmx-btn dmx-btn--ghost dmx-btn--sm" :disabled="!dirty" @click="reset">Reset</button>
        <span v-if="invalidRoutes" class="dmx-note" data-tone="fault">Every route entry needs a provider/model value.</span>
        <span v-else-if="dirty && !saveError" class="dmx-faint" style="font-size: 11.5px">Unsaved changes</span>
        <span v-if="saveError" class="dmx-note" data-tone="fault" role="alert">{{ saveError }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import DemiurgeIcon from '~/components/Demiurge/Icon.vue';
import ModelRouteList from '~/components/Demiurge/ModelRouteList.vue';
import { dmxGet, dmxPost } from '~/composables/useDemiurgeConsole';

const props = defineProps<{ stewardId?: string; system?: boolean }>();
const getUrl = () => props.system ? '/demiurge/system/settings' : `/demiurge/settings?stewardID=${encodeURIComponent(props.stewardId ?? '')}`;
const updateUrl = () => props.system ? '/demiurge/system/settings/update' : '/demiurge/settings/update';
const updateBody = (patch: Record<string, any>) => props.system ? patch : { stewardID: props.stewardId, ...patch };

const loading = ref(true);
const loadError = ref('');
const saving = ref(false);
const original = ref<Record<string, any>>({});
const form = reactive<Record<string, any>>({});
const openRoutes = ref(new Set<string>());

// `route` is the server-side RouteParameters key for the same route the `key` list configures.
// `parametersNote`, when present, replaces the parameter panel: the route has no parameters of
// its own because its models ride another route's request.
type ModelField = {
  key: string; route: string; legacy: string; label: string; placeholder: string; parametersNote?: string;
};
const modelFields: ModelField[] = [
  { key: 'commanderRoutes', route: 'commander', legacy: 'commanderModel', label: 'Commander', placeholder: 'anthropic/claude-sonnet-4.5' },
  { key: 'utilityRoutes', route: 'utility', legacy: 'utilityModel', label: 'Utility (digests/reports)', placeholder: 'openai/gpt-4.1-mini' },
  { key: 'councilRoutes', route: 'council', legacy: 'councilModel', label: 'Council', placeholder: 'anthropic/claude-sonnet-4.5' },
  { key: 'tierTextRoutes', route: 'tierText', legacy: 'tierTextModel', label: 'Tier: Text', placeholder: 'openai/gpt-4.1-mini' },
  { key: 'tierTextImageRoutes', route: 'tierTextImage', legacy: 'tierTextImageModel', label: 'Tier: Text+Image', placeholder: 'openai/gpt-4.1' },
  { key: 'tierTextImageVideoRoutes', route: 'tierTextImageVideo', legacy: 'tierTextImageVideoModel', label: 'Tier: +Video', placeholder: 'anthropic/claude-sonnet-4.5' },
  { key: 'tierTextImageVideoAudioRoutes', route: 'tierTextImageVideoAudio', legacy: 'tierTextImageVideoAudioModel', label: 'Tier: +Audio', placeholder: 'google/gemini-2.5-pro' },
  { key: 'stimulusFreeRoutes', route: 'stimulusFree', legacy: 'stimulusFreeModel', label: 'Triage (free)', placeholder: 'openai/gpt-4.1-mini' },
  {
    key: 'stimulusFallbackRoutes', route: 'stimulusFallback', legacy: 'stimulusFallbackModel',
    label: 'Triage (fallback)', placeholder: 'openai/gpt-4.1-mini',
    parametersNote: 'These models are appended to the free triage route’s single request, so Triage (free) parameters govern them too.',
  },
];
for (const f of modelFields) form[f.key] = [''];
form.routeParameters = emptyRouteParameters();
form.visionEnabled = true;
form.containersEnabled = true;
form.liveActivityStreaming = true;
form.instantRepliesEnabled = true;
form.momentumEnabled = true;
form.desktopImage = 'omnipotent/demiurge-desktop:latest';
form.desktopAllocation = 'PerAgentContainers';
form.blockedDomainsText = '';
form.askFirstDomainsText = '';
form.allowHostShell = true;
form.allowOutboundEmail = true;
form.allowAccountCreation = true;
const EDITABLE = [...modelFields.map(f => f.key), 'routeParameters', 'visionEnabled', 'containersEnabled',
  'liveActivityStreaming', 'instantRepliesEnabled', 'momentumEnabled', 'desktopImage', ...(props.system ? [] : ['desktopAllocation']),
  'blockedDomainsText', 'askFirstDomainsText', 'allowHostShell', 'allowOutboundEmail', 'allowAccountCreation'];
// UI field → server setting name. Domain lists are edited as text and sent as arrays.
const SERVER_KEY: Record<string, string> = { blockedDomainsText: 'blockedDomains', askFirstDomainsText: 'askFirstDomains' };
const domainLines = (text: string) => String(text || '').split(/[\n,;\s]+/).map(x => x.trim()).filter(Boolean);
const saveError = ref('');

// Every route gets a (possibly empty) bag so v-model:parameters always has a target. Empty bags are
// dropped again on save, which is exactly how the server clears a route back to model defaults.
function emptyRouteParameters(): Record<string, Record<string, any>> {
  return Object.fromEntries(modelFields.map(f => [f.route, {}]));
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const same = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);
function cleanRoutes(value: any, fallback = ''): string[] {
  const source = Array.isArray(value) ? value : [value ?? fallback];
  const seen = new Set<string>();
  return source.map(v => String(v ?? '').trim()).filter(v => {
    const key = v.toLowerCase();
    return !!v && !seen.has(key) && !!seen.add(key);
  });
}

const dirty = computed(() => EDITABLE.some(k => !same(form[k], original.value[k])));
const routeInvalid = (f: ModelField) => !Array.isArray(form[f.key]) || form[f.key].length === 0 || form[f.key].some((r: string) => !r.trim());
const routeTuned = (f: ModelField) => Object.keys(form.routeParameters?.[f.route] ?? {}).length > 0;
const invalidRoutes = computed(() => modelFields.some(routeInvalid));
function toggleRoute(key: string) {
  const next = new Set(openRoutes.value);
  if (next.has(key)) next.delete(key); else next.add(key);
  openRoutes.value = next;
}

function applySettings(s: Record<string, any>, desktopAllocation?: string) {
  for (const f of modelFields) form[f.key] = cleanRoutes(s[f.key], s[f.legacy]);
  const saved = s.routeParameters ?? {};
  form.routeParameters = Object.fromEntries(
    modelFields.map(f => [f.route, { ...(saved[f.route] ?? {}) }]));
  for (const k of ['visionEnabled', 'containersEnabled', 'liveActivityStreaming', 'desktopImage']) form[k] = s[k];
  for (const k of ['instantRepliesEnabled', 'momentumEnabled']) form[k] = s[k] ?? true;
  form.blockedDomainsText = (s.blockedDomains ?? []).join('\n');
  form.askFirstDomainsText = (s.askFirstDomains ?? []).join('\n');
  for (const k of ['allowHostShell', 'allowOutboundEmail', 'allowAccountCreation']) form[k] = s[k] ?? true;
  if (!props.system) form.desktopAllocation = desktopAllocation ?? form.desktopAllocation ?? 'PerAgentContainers';
}

async function load() {
  loading.value = true;
  loadError.value = '';
  const [res, stewardRes] = await Promise.all([
    dmxGet<Record<string, any>>(getUrl()),
    props.system ? Promise.resolve(null) : dmxGet<any>(`/demiurge/get?stewardID=${encodeURIComponent(props.stewardId ?? '')}`),
  ]);
  if (res.ok && res.body) {
    applySettings(res.body, stewardRes?.ok ? stewardRes.body?.desktopAllocation : undefined);
    original.value = clone(form);
  } else {
    loadError.value = res.status ? `The server answered HTTP ${res.status}.` : 'The server did not answer.';
  }
  loading.value = false;
}

function reset() { for (const k of EDITABLE) form[k] = clone(original.value[k]); }

async function save() {
  if (invalidRoutes.value || saving.value) return;
  saving.value = true;
  saveError.value = '';
  const patch: Record<string, any> = {};
  for (const k of EDITABLE) if (!same(form[k], original.value[k]))
    patch[SERVER_KEY[k] ?? k] = SERVER_KEY[k] ? domainLines(form[k])
      : k.endsWith('Routes') ? cleanRoutes(form[k])
      // Routes with nothing pinned are sent as absent rather than empty, which is how the server
      // clears a route back to its models' own defaults.
      : k === 'routeParameters' ? Object.fromEntries(Object.entries(form[k])
          .filter(([, values]: [string, any]) => values && Object.keys(values).length > 0))
      : form[k];
  const r = await dmxPost<any>(updateUrl(), updateBody(patch));
  saving.value = false;
  if (!r.ok) { saveError.value = r.error; return; }
  if (r.body?.settings) applySettings(r.body.settings, r.body.desktopAllocation);
  original.value = clone(form);
  if (Array.isArray(r.body?.unknown) && r.body.unknown.length)
    saveError.value = `This server does not know: ${r.body.unknown.join(', ')}. Update Omnipotent to use them.`;
}

onMounted(load);
</script>
