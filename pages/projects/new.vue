<template>
  <ProjectsShell>
    <section class="pjx-card pjx-verdict" data-tone="accent" aria-label="New project">
      <span class="pjx-verdict__glyph"><ProjectsIcon name="rocket" /></span>
      <div class="pjx-verdict__text">
        <h1 class="pjx-verdict__headline">Start a project</h1>
        <p class="pjx-verdict__sub">A goal and a budget, pursued around the clock by a Commander and its agents. It drafts a Grand Plan first and waits for your approval before it executes.</p>
      </div>
    </section>

    <div class="pjx-new">
      <div class="pjx-new__main">
        <!-- 1 · goal -->
        <section class="pjx-card" aria-label="Goal">
          <header class="pjx-card__head"><h2 class="pjx-card__title pjx-step"><span class="pjx-step__n" :data-done="(form.name && form.goal) || undefined">1</span>What should it achieve?</h2></header>
          <div class="pjx-card__body" style="display: flex; flex-direction: column; gap: 12px">
            <div class="pjx-field">
              <label for="np-name">Project name</label>
              <input id="np-name" ref="nameInput" v-model.trim="form.name" class="pjx-input pjx-name" placeholder="e.g. Print-on-demand storefront" maxlength="80" />
            </div>
            <div class="pjx-field">
              <label for="np-goal">The goal <span class="pjx-faint">· given to the Commander word for word; it is the north star</span></label>
              <textarea id="np-goal" v-model.trim="form.goal" class="pjx-textarea pjx-goal" rows="5" placeholder="e.g. Build and run a profitable print-on-demand store, reinvest the profit, and report to me every week."></textarea>
              <span class="pjx-faint" style="font-size: 11px">Say what done looks like and how you want to hear about progress. The Commander turns it into milestones.</span>
            </div>
          </div>
        </section>

        <!-- 2 · budget -->
        <section class="pjx-card" aria-label="Budget and autonomy">
          <header class="pjx-card__head"><h2 class="pjx-card__title pjx-step"><span class="pjx-step__n" :data-done="(form.tokenBudgetUsd || 0) > 0 || undefined">2</span>Budget and autonomy</h2></header>
          <div class="pjx-card__body" style="display: flex; flex-direction: column; gap: 14px">
            <div class="pjx-field">
              <span class="pjx-field__label">Model budget: what it may spend on AI</span>
              <div class="pjx-presets" role="group" aria-label="Model budget presets">
                <button v-for="p in TOKEN_PRESETS" :key="p.v" type="button" class="pjx-preset" :aria-pressed="form.tokenBudgetUsd === p.v" @click="form.tokenBudgetUsd = p.v"><b>{{ pjUsd(p.v) }}</b><span>{{ p.note }}</span></button>
              </div>
            </div>
            <div class="pjx-field">
              <span class="pjx-field__label">Real money: ads, subscriptions, services</span>
              <div class="pjx-presets" role="group" aria-label="External budget presets">
                <button v-for="p in MONEY_PRESETS" :key="p.v" type="button" class="pjx-preset" :aria-pressed="form.moneyBudgetUsd === p.v" @click="form.moneyBudgetUsd = p.v"><b>{{ p.v ? pjUsd(p.v) : 'None' }}</b><span>{{ p.note }}</span></button>
              </div>
            </div>
            <div class="pjx-grid2">
              <div class="pjx-field">
                <label for="np-token">Model budget (USD)</label>
                <input id="np-token" v-model.number="form.tokenBudgetUsd" class="pjx-input pjx-num" type="number" min="0" step="0.5" />
                <span class="pjx-faint" style="font-size: 11px">Warned at 80%; paused for a top-up at 100%.</span>
              </div>
              <div class="pjx-field">
                <label for="np-money">Money budget (USD)</label>
                <input id="np-money" v-model.number="form.moneyBudgetUsd" class="pjx-input pjx-num" type="number" min="0" step="1" />
                <span class="pjx-faint" style="font-size: 11px">0 means no real money at all.</span>
              </div>
              <div class="pjx-field">
                <label for="np-auto">Spend without asking, per action (USD)</label>
                <input id="np-auto" v-model.number="form.moneyAutonomousThresholdUsd" class="pjx-input pjx-num" type="number" min="0" step="1" />
                <span class="pjx-faint" style="font-size: 11px">Anything above this waits for your approval.</span>
              </div>
              <div class="pjx-field">
                <label for="np-cap">Agent cap</label>
                <input id="np-cap" v-model.number="form.subAgentCap" class="pjx-input pjx-num" type="number" min="1" max="50" step="1" />
                <span class="pjx-faint" style="font-size: 11px">Commander, sub-agents and their helpers at once.</span>
              </div>
            </div>
          </div>
        </section>

        <!-- 3 · behaviour -->
        <section class="pjx-card" aria-label="Computers and behaviour">
          <header class="pjx-card__head"><h2 class="pjx-card__title pjx-step"><span class="pjx-step__n" data-done>3</span>Computers and behaviour</h2><span class="pjx-card__meta">from your project defaults</span></header>
          <div class="pjx-card__body" style="padding-top: 2px; padding-bottom: 2px">
            <button type="button" class="pjx-toggle" role="switch" :aria-checked="!!settings.containersEnabled" aria-label="Desktop computers" @click="settings.containersEnabled = !settings.containersEnabled">
              <span class="pjx-toggle__copy"><b>Desktop computers</b><span>Agents get real desktops: mouse, keyboard, screen and a browser. Leave off for a text-only project.</span></span>
              <span class="pjx-switch" :data-on="settings.containersEnabled || undefined" aria-hidden="true"></span>
            </button>
            <div v-if="settings.containersEnabled" class="pjx-toggle" style="cursor: default">
              <span class="pjx-toggle__copy"><b>Browser sign-ins</b><span>Shared: every agent uses one signed-in browser, taking turns.</span></span>
              <select v-model="settings.desktopAllocation" class="pjx-select" aria-label="Browser sign-ins">
                <option value="PerAgentContainers">A browser per agent</option>
                <option value="SharedDesktopWithInputLock">One shared browser</option>
              </select>
            </div>
            <button type="button" class="pjx-toggle" role="switch" :aria-checked="!!settings.visionEnabled" aria-label="Vision" @click="settings.visionEnabled = !settings.visionEnabled">
              <span class="pjx-toggle__copy"><b>Vision</b><span>Agents see a screenshot after each desktop action.</span></span>
              <span class="pjx-switch" :data-on="settings.visionEnabled || undefined" aria-hidden="true"></span>
            </button>
            <div v-if="settings.containersEnabled && showAdvanced" class="pjx-toggle" style="cursor: default">
              <span class="pjx-toggle__copy"><b>Desktop image</b><span>The container image each computer starts from.</span></span>
              <input v-model.trim="settings.desktopImage" class="pjx-input pjx-mono" style="max-width: 300px" aria-label="Desktop image" placeholder="omnipotent/projects-desktop:latest" />
            </div>
          </div>
        </section>

        <!-- 4 · files -->
        <section class="pjx-card" aria-label="Starting files">
          <header class="pjx-card__head"><h2 class="pjx-card__title pjx-step"><span class="pjx-step__n" :data-done="uploadState.selected ? (uploadState.ready || undefined) : true">4</span>Starting files</h2><span class="pjx-card__meta">optional · placed under <code class="pjx-mono">inputs/</code> before the first wake</span></header>
          <div class="pjx-card__body ot-os pjx-embed">
            <ProjectsFileUploader
              ref="initialUploader"
              purpose="initial"
              title="Briefs, research, datasets, brand kits or whole folders"
              hint="Folder structure is kept, and every agent can see who uploaded each file and when."
              @state="onUploadState"
            />
          </div>
        </section>

        <!-- 5 · models -->
        <section class="pjx-card" aria-label="Model routing">
          <header class="pjx-card__head">
            <h2 class="pjx-card__title pjx-step"><span class="pjx-step__n" :data-done="routesValid || undefined">5</span>Model routing</h2>
            <span class="pjx-card__meta">{{ showModels ? 'per role; the tier list doubles as a price list' : `inherits your defaults · Commander ${settings.commanderRoutes?.[0] || '—'}` }}</span>
            <div class="pjx-card__tools">
              <button type="button" class="pjx-btn pjx-btn--ghost pjx-btn--sm" :aria-expanded="showModels" @click="showModels = !showModels; showAdvanced = showAdvanced || showModels">{{ showModels ? 'Hide' : 'Customize' }}</button>
            </div>
          </header>
          <div v-if="showModels" class="pjx-card__body ot-os pjx-embed" style="display: flex; flex-direction: column; gap: 12px">
            <ModelRouteList
              v-for="f in modelFields"
              :key="f.key"
              v-model="settings[f.key]"
              v-model:parameters="settings.routeParameters[f.route]"
              :label="f.label"
              :placeholder="f.placeholder"
              :show-parameters="!('parametersNote' in f)"
              :parameters-note="'parametersNote' in f ? f.parametersNote : ''"
            />
            <p v-if="!routesValid" class="pjx-note" data-tone="fault">Every model route needs a provider/model value.</p>
          </div>
        </section>
      </div>

      <!-- ── rail ── -->
      <aside class="pjx-new__rail" aria-label="Ready to deploy">
        <div class="pjx-card">
          <div class="pjx-rail__section">
            <div class="pjx-rail__label">Ready to deploy?</div>
            <ul class="pjx-checklist">
              <li :data-done="!!form.name || undefined"><ProjectsIcon :name="form.name ? 'check-circle' : 'dot'" />Named</li>
              <li :data-done="!!form.goal || undefined"><ProjectsIcon :name="form.goal ? 'check-circle' : 'dot'" />Goal written</li>
              <li :data-done="(form.tokenBudgetUsd || 0) > 0 || undefined"><ProjectsIcon :name="(form.tokenBudgetUsd || 0) > 0 ? 'check-circle' : 'dot'" />Model budget set</li>
              <li v-if="uploadState.selected" :data-done="(uploadState.ready && !uploadState.busy) || undefined"><ProjectsIcon :name="uploadState.ready && !uploadState.busy ? 'check-circle' : 'hourglass'" />{{ uploadState.ready && !uploadState.busy ? `${uploadState.selected} ${uploadState.selected === 1 ? 'file' : 'files'} ready` : 'Uploading files…' }}</li>
              <li v-if="!routesValid"><ProjectsIcon name="alert" />A model route is empty</li>
            </ul>
          </div>
          <div class="pjx-rail__section">
            <dl class="pjx-recap">
              <dt>Model budget</dt><dd>{{ pjUsd(form.tokenBudgetUsd || 0) }}</dd>
              <dt>Real money</dt><dd>{{ form.moneyBudgetUsd ? pjUsd(form.moneyBudgetUsd) : 'none' }}</dd>
              <dt>Without asking</dt><dd>{{ form.moneyAutonomousThresholdUsd ? `≤ ${pjUsd(form.moneyAutonomousThresholdUsd)} an action` : 'always asks' }}</dd>
              <dt>Agents</dt><dd>up to {{ form.subAgentCap || 5 }}</dd>
              <dt>Computers</dt><dd>{{ settings.containersEnabled ? (settings.desktopAllocation === 'SharedDesktopWithInputLock' ? 'on · shared browser' : 'on · own browsers') : 'off' }}</dd>
              <dt>Commander</dt><dd :title="settings.commanderRoutes?.[0]" class="pjx-mono">{{ settings.commanderRoutes?.[0] || '—' }}</dd>
            </dl>
          </div>
          <div class="pjx-rail__section" style="display: flex; flex-direction: column; gap: 8px">
            <p v-if="error" class="pjx-note" data-tone="fault" role="alert">{{ error }}</p>
            <button class="pjx-btn pjx-btn--primary" style="width: 100%; height: 38px" :disabled="!canDeploy || deploying" aria-keyshortcuts="Control+Enter" @click="deploy">
              <ProjectsIcon name="rocket" />{{ deploying ? 'Deploying…' : uploadState.busy ? 'Waiting for files…' : 'Deploy project' }}
            </button>
            <div style="display: flex; justify-content: space-between; align-items: center">
              <button class="pjx-btn pjx-btn--ghost pjx-btn--sm" :disabled="deploying" @click="cancel">Cancel</button>
              <span class="pjx-faint" style="font-size: 11px"><span class="pjx-kbd">Ctrl</span> <span class="pjx-kbd">Enter</span> deploys</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </ProjectsShell>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { pjUsd } from '~/scripts/projectsConsole';
import ProjectsFileUploader from '~/components/Projects/FileUploader.vue';
import ModelRouteList from '~/components/Projects/ModelRouteList.vue';
import ProjectsShell from '~/components/Projects/Shell.vue';
import ProjectsIcon from '~/components/Projects/Icon.vue';

definePageMeta({ layout: 'navbar' });
useHead({ title: 'Projects · New project' });

const router = useRouter();

// One-click starting points; the exact fields below take any value.
const TOKEN_PRESETS = [
  { v: 5, note: 'a trial run' },
  { v: 10, note: 'a few days' },
  { v: 25, note: 'a few weeks' },
  { v: 100, note: 'a long campaign' },
];
const MONEY_PRESETS = [
  { v: 0, note: 'never spends' },
  { v: 20, note: 'small tests' },
  { v: 100, note: 'ads and tools' },
];

const form = reactive({
  name: '',
  goal: '',
  tokenBudgetUsd: 10,
  moneyBudgetUsd: 0,
  moneyAutonomousThresholdUsd: 0,
  subAgentCap: 5,
});

// `route` is the server-side RouteParameters key for the same route the `key` list configures.
const modelFields = [
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
] as const;

const settings = reactive<Record<string, any>>({
  visionEnabled: true,
  containersEnabled: false,
  desktopImage: 'omnipotent/projects-desktop:latest',
  desktopAllocation: 'PerAgentContainers',
  commanderRoutes: [''], utilityRoutes: [''], councilRoutes: [''],
  tierTextRoutes: [''], tierTextImageRoutes: [''], tierTextImageVideoRoutes: [''], tierTextImageVideoAudioRoutes: [''],
  stimulusFreeRoutes: [''], stimulusFallbackRoutes: [''],
  // Per-route sampling parameters; every route gets a bag so v-model:parameters always has a target.
  routeParameters: Object.fromEntries(modelFields.map(f => [f.route, {} as Record<string, any>])),
});
const defaults = ref<Record<string, any>>({});

const showModels = ref(false);
const showAdvanced = ref(false);
const deploying = ref(false);
const error = ref('');
const nameInput = ref<HTMLInputElement | null>(null);
const initialUploader = ref<InstanceType<typeof ProjectsFileUploader> | null>(null);
const uploadState = ref({ sessionID: null as string | null, selected: 0, ready: true, busy: false });

const routesValid = computed(() => modelFields.every(f => Array.isArray(settings[f.key]) && settings[f.key].length > 0 && settings[f.key].every((r: string) => !!r.trim())));
const canDeploy = computed(() => !!form.name && !!form.goal && (form.tokenBudgetUsd || 0) > 0 && uploadState.value.ready && !uploadState.value.busy && routesValid.value);
function onUploadState(value: typeof uploadState.value) { uploadState.value = value; }

// Prefill model routing + behaviour from the system defaults so the page shows the
// inherited values Klives can override, rather than empty boxes.
async function loadDefaults() {
  try {
    const res = await RequestGETFromKliveAPI('/projects/system/settings', false, false);
    if (!res.ok) return;
    const d = await res.json();
    defaults.value = d;
    for (const f of modelFields) settings[f.key] = cleanRoutes(d[f.key] ?? [d[f.legacy] ?? f.placeholder]);
    settings.routeParameters = Object.fromEntries(
      modelFields.map(f => [f.route, { ...((d.routeParameters ?? {})[f.route] ?? {}) }]));
    settings.visionEnabled = d.visionEnabled ?? true;
    settings.containersEnabled = d.containersEnabled ?? false;
    settings.desktopImage = d.desktopImage ?? 'omnipotent/projects-desktop:latest';
  } catch { /* fall back to placeholders */ }
}

// Only send settings that differ from the inherited defaults — an unchanged project
// simply inherits, keeping the create payload minimal and future-proof.
function cleanRoutes(value: any): string[] {
  const seen = new Set<string>();
  return (Array.isArray(value) ? value : [value]).map(v => String(v ?? '').trim()).filter(v => {
    const key = v.toLowerCase();
    return !!v && !seen.has(key) && !!seen.add(key);
  });
}

// Routes with no pinned parameters are dropped rather than sent as empty objects, so the payload
// carries only what Klives actually configured (and matches what the server stores back).
function prunedRouteParameters(source: Record<string, any>): Record<string, any> {
  return Object.fromEntries(Object.entries(source ?? {})
    .filter(([, values]) => values && Object.keys(values).length > 0));
}

function changedSettings(): Record<string, any> {
  const patch: Record<string, any> = {};
  const keys = [...modelFields.map(f => f.key), 'routeParameters', 'visionEnabled', 'containersEnabled', 'desktopImage', 'desktopAllocation'];
  for (const k of keys) {
    const cur = k === 'routeParameters' ? prunedRouteParameters(settings[k]) : settings[k];
    const base = k === 'routeParameters' ? prunedRouteParameters(defaults.value[k]) : defaults.value[k];
    if (k === 'routeParameters' && Object.keys(cur).length === 0 && Object.keys(base).length === 0) continue;
    if (base === undefined || JSON.stringify(cur) !== JSON.stringify(base)) {
      if (k.endsWith('Routes')) patch[k] = cleanRoutes(cur);
      else if (cur !== '' && cur !== undefined && cur !== null) patch[k] = cur;
    }
  }
  return patch;
}

async function deploy() {
  error.value = '';
  if (deploying.value) return;
  if (!canDeploy.value) { error.value = 'A name, a goal and a model budget above $0 are needed.'; return; }
  deploying.value = true;
  try {
    const payload: Record<string, any> = {
      name: form.name,
      goal: form.goal,
      tokenBudgetUsd: Number(form.tokenBudgetUsd) || 0,
      moneyBudgetUsd: Number(form.moneyBudgetUsd) || 0,
      moneyAutonomousThresholdUsd: Number(form.moneyAutonomousThresholdUsd) || 0,
      subAgentCap: Number(form.subAgentCap) || 5,
    };
    const patch = changedSettings();
    if (Object.keys(patch).length) payload.settings = patch;
    if (uploadState.value.sessionID) payload.initialUploadSessionID = uploadState.value.sessionID;

    const res = await RequestPOSTFromKliveAPI('/projects/create', JSON.stringify(payload), false, true);
    if (!res.ok) {
      error.value = `Create failed (HTTP ${res.status}). ${await res.text().catch(() => '')}`.trim();
      return;
    }
    const created = await res.json();
    if (created?.projectID) router.push(`/projects/${created.projectID}`);
    else router.push('/projects');
  } catch (e: any) {
    error.value = e?.message ?? String(e);
  } finally {
    deploying.value = false;
  }
}

async function cancel() {
  if (uploadState.value.sessionID) await initialUploader.value?.clear();
  router.push('/projects');
}

function onKey(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); deploy(); }
}
onMounted(async () => {
  loadDefaults();
  window.addEventListener('keydown', onKey);
  await nextTick();
  nameInput.value?.focus();
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>
