<template>
  <div class="np-page">
    <div class="np-head">
      <NuxtLink to="/projects" class="np-back">← Projects</NuxtLink>
      <h1 class="np-title">Deploy a new project</h1>
      <p class="np-sub">A project is a goal <em>and</em> a budget, pursued 24/7 by a Commander and its sub-agents. Configure it deliberately — once deployed it starts working immediately.</p>
    </div>

    <div class="np-body">
      <div class="np-main">
        <!-- ── Goal & identity ── -->
        <section class="np-card">
          <h2 class="np-card-title">Goal &amp; identity</h2>
          <label class="np-field">
            <span class="np-label">Project name</span>
            <input v-model.trim="form.name" class="np-input" placeholder="e.g. Dropshipping storefront" maxlength="80" />
          </label>
          <label class="np-field">
            <span class="np-label">The goal <span class="np-hint">stated verbatim — this is the Commander's north star</span></span>
            <textarea v-model.trim="form.goal" class="np-textarea" rows="4" placeholder="e.g. Build and run a profitable print-on-demand store, reinvesting profit, reporting weekly."></textarea>
          </label>
        </section>

        <section class="np-card">
          <h2 class="np-card-title">Initial shared files <span class="np-optional">optional</span></h2>
          <p class="np-sublabel np-cardnote">Seed the project with briefs, research, datasets, brand kits, or whole folders. They are placed under <code>inputs/</code> before the Commander starts its first wake.</p>
          <ProjectsFileUploader
            ref="initialUploader"
            purpose="initial"
            title="Initialize the project filesystem"
            hint="The original folder structure is preserved. Project workers can see who uploaded each file and when."
            @state="onUploadState"
          />
        </section>

        <!-- ── Budgets & autonomy ── -->
        <section class="np-card">
          <h2 class="np-card-title">Budget &amp; autonomy</h2>
          <div class="np-grid2">
            <label class="np-field">
              <span class="np-label">Token budget (USD) <span class="np-req">required</span></span>
              <input v-model.number="form.tokenBudgetUsd" class="np-input" type="number" min="0" step="0.5" placeholder="10" />
              <span class="np-sublabel">Total LLM spend allowed. At ~80% you're warned; at 100% the project pauses for a top-up.</span>
            </label>
            <label class="np-field">
              <span class="np-label">Money budget (USD)</span>
              <input v-model.number="form.moneyBudgetUsd" class="np-input" type="number" min="0" step="1" placeholder="0" />
              <span class="np-sublabel">Real-money spend allowed (ads, subscriptions, services). 0 = no real money.</span>
            </label>
            <label class="np-field">
              <span class="np-label">Autonomous money / action (USD)</span>
              <input v-model.number="form.moneyAutonomousThresholdUsd" class="np-input" type="number" min="0" step="1" placeholder="0" />
              <span class="np-sublabel">Single spends at or below this are the Commander's own call; above needs your approval.</span>
            </label>
            <label class="np-field">
              <span class="np-label">Agent cap</span>
              <input v-model.number="form.subAgentCap" class="np-input" type="number" min="1" max="50" step="1" placeholder="5" />
              <span class="np-sublabel">Max concurrent agents (Commander + sub-agents + one-level helpers).</span>
            </label>
          </div>
        </section>

        <!-- ── Behaviour ── -->
        <section class="np-card">
          <h2 class="np-card-title">Behaviour</h2>
          <label class="np-toggle">
            <span>
              <span class="np-label">Desktop containers</span>
              <span class="np-sublabel">Give agents real desktops (mouse/keyboard/screen). Leave off for a text-only project.</span>
            </span>
            <input type="checkbox" v-model="settings.containersEnabled" />
          </label>
          <label class="np-toggle">
            <span>
              <span class="np-label">Vision</span>
              <span class="np-sublabel">Feed screenshots back to video-tier agents after each desktop action.</span>
            </span>
            <input type="checkbox" v-model="settings.visionEnabled" />
          </label>
          <label v-if="settings.containersEnabled" class="np-field">
            <span class="np-label">Desktop image</span>
            <input v-model.trim="settings.desktopImage" class="np-input mono" placeholder="omnipotent/projects-desktop:latest" />
          </label>
        </section>

        <!-- ── Model routing ── -->
        <section class="np-card">
          <div class="np-card-title-row">
            <h2 class="np-card-title">Model routing</h2>
            <button type="button" class="np-linkbtn" @click="showModels = !showModels">{{ showModels ? 'Hide' : 'Customize' }}</button>
          </div>
          <p class="np-sublabel np-cardnote">Prefilled from your system defaults. The tier list doubles as a price list (text &lt; image &lt; video &lt; audio).</p>
          <div v-if="showModels" class="np-models">
            <label v-for="f in modelFields" :key="f.key" class="np-field np-modelrow">
              <span class="np-label">{{ f.label }}</span>
              <input v-model.trim="settings[f.key]" class="np-input mono" :placeholder="f.placeholder" />
            </label>
          </div>
        </section>
      </div>

      <!-- ── Summary rail ── -->
      <aside class="np-rail">
        <div class="np-summary">
          <h3>Ready to deploy?</h3>
          <ul class="np-check">
            <li :class="{ ok: form.name }">{{ form.name ? '✓' : '•' }} Named</li>
            <li :class="{ ok: form.goal }">{{ form.goal ? '✓' : '•' }} Goal set</li>
            <li :class="{ ok: (form.tokenBudgetUsd || 0) > 0 }">{{ (form.tokenBudgetUsd || 0) > 0 ? '✓' : '•' }} Token budget</li>
            <li v-if="uploadState.selected" :class="{ ok: uploadState.ready }">{{ uploadState.ready ? '✓' : '•' }} {{ uploadState.ready ? `${uploadState.selected} file${uploadState.selected === 1 ? '' : 's'} ready` : 'Uploading files' }}</li>
          </ul>
          <div class="np-recap">
            <div class="np-recap-row"><span>Tokens</span><span>${{ (form.tokenBudgetUsd || 0).toFixed(2) }}</span></div>
            <div class="np-recap-row"><span>Money</span><span>${{ (form.moneyBudgetUsd || 0).toFixed(2) }}</span></div>
            <div class="np-recap-row"><span>Autonomous ≤</span><span>${{ (form.moneyAutonomousThresholdUsd || 0).toFixed(2) }}</span></div>
            <div class="np-recap-row"><span>Agent cap</span><span>{{ form.subAgentCap || 5 }}</span></div>
            <div class="np-recap-row"><span>Containers</span><span>{{ settings.containersEnabled ? 'on' : 'off' }}</span></div>
            <div class="np-recap-row"><span>Commander</span><span class="mono ellip">{{ settings.commanderModel || '—' }}</span></div>
          </div>
          <p v-if="error" class="np-error">{{ error }}</p>
          <button class="np-deploy" :disabled="!canDeploy || deploying" @click="deploy">
            {{ deploying ? 'Deploying…' : uploadState.busy ? 'Waiting for files…' : 'Deploy project' }}
          </button>
          <button class="np-cancel" :disabled="deploying" @click="cancel">Cancel</button>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import ProjectsFileUploader from '~/components/Projects/FileUploader.vue';

definePageMeta({ layout: 'navbar' });

const router = useRouter();

const form = reactive({
  name: '',
  goal: '',
  tokenBudgetUsd: 10,
  moneyBudgetUsd: 0,
  moneyAutonomousThresholdUsd: 0,
  subAgentCap: 5,
});

const modelFields = [
  { key: 'commanderModel', label: 'Commander', placeholder: 'anthropic/claude-sonnet-4.5' },
  { key: 'utilityModel', label: 'Utility (digests/reports)', placeholder: 'openai/gpt-4.1-mini' },
  { key: 'tierTextModel', label: 'Tier: Text', placeholder: 'openai/gpt-4.1-mini' },
  { key: 'tierTextImageModel', label: 'Tier: Text+Image', placeholder: 'openai/gpt-4.1' },
  { key: 'tierTextImageVideoModel', label: 'Tier: +Video', placeholder: 'anthropic/claude-sonnet-4.5' },
  { key: 'tierTextImageVideoAudioModel', label: 'Tier: +Audio', placeholder: 'google/gemini-2.5-pro' },
  { key: 'stimulusFreeModel', label: 'Triage (free)', placeholder: 'openai/gpt-4.1-mini' },
  { key: 'stimulusFallbackModel', label: 'Triage (fallback)', placeholder: 'openai/gpt-4.1-mini' },
] as const;

const settings = reactive<Record<string, any>>({
  visionEnabled: true,
  containersEnabled: false,
  desktopImage: 'omnipotent/projects-desktop:latest',
  commanderModel: '', utilityModel: '',
  tierTextModel: '', tierTextImageModel: '', tierTextImageVideoModel: '', tierTextImageVideoAudioModel: '',
  stimulusFreeModel: '', stimulusFallbackModel: '',
});
const defaults = ref<Record<string, any>>({});

const showModels = ref(false);
const deploying = ref(false);
const error = ref('');
const initialUploader = ref<InstanceType<typeof ProjectsFileUploader> | null>(null);
const uploadState = ref({ sessionID: null as string | null, selected: 0, ready: true, busy: false });

const canDeploy = computed(() => !!form.name && !!form.goal && (form.tokenBudgetUsd || 0) > 0 && uploadState.value.ready && !uploadState.value.busy);
function onUploadState(value: typeof uploadState.value) { uploadState.value = value; }

// Prefill model routing + behaviour from the system defaults so the page shows the
// inherited values Klives can override, rather than empty boxes.
async function loadDefaults() {
  try {
    const res = await RequestGETFromKliveAPI('/projects/system/settings', false, false);
    if (!res.ok) return;
    const d = await res.json();
    defaults.value = d;
    for (const f of modelFields) settings[f.key] = d[f.key] ?? '';
    settings.visionEnabled = d.visionEnabled ?? true;
    settings.containersEnabled = d.containersEnabled ?? false;
    settings.desktopImage = d.desktopImage ?? 'omnipotent/projects-desktop:latest';
  } catch { /* fall back to placeholders */ }
}

// Only send settings that differ from the inherited defaults — an unchanged project
// simply inherits, keeping the create payload minimal and future-proof.
function changedSettings(): Record<string, string> {
  const patch: Record<string, string> = {};
  const keys = [...modelFields.map(f => f.key), 'visionEnabled', 'containersEnabled', 'desktopImage'];
  for (const k of keys) {
    const cur = settings[k];
    if (defaults.value[k] === undefined || String(cur) !== String(defaults.value[k])) {
      if (cur !== '' && cur !== undefined && cur !== null) patch[k] = String(cur);
    }
  }
  return patch;
}

async function deploy() {
  error.value = '';
  if (!canDeploy.value) { error.value = 'Name, goal, and a token budget above 0 are required.'; return; }
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

onMounted(loadDefaults);
</script>

<style scoped>
.np-page { padding: 24px; color: #e6e6e6; max-width: 1180px; margin: 0 auto; }
.np-head { margin-bottom: 22px; }
.np-back { color: #7fb0d9; text-decoration: none; font-size: 13px; }
.np-back:hover { text-decoration: underline; }
.np-title { margin: 10px 0 6px; font-size: 28px; }
.np-sub { margin: 0; color: #999; font-size: 14px; max-width: 720px; line-height: 1.5; }
.np-sub em { color: #cbcbcb; font-style: italic; }

.np-body { display: grid; grid-template-columns: 1fr 300px; gap: 20px; align-items: start; }
@media (max-width: 900px) { .np-body { grid-template-columns: 1fr; } }

.np-main { display: flex; flex-direction: column; gap: 16px; }
.np-card { background: #161519; border: 1px solid #2a2a2e; border-radius: 10px; padding: 18px 20px; }
.np-card-title { margin: 0 0 14px; font-size: 15px; color: #eee; }
.np-optional { color: #666; font-size: 10px; font-weight: 400; margin-left: 6px; }
.np-card-title-row { display: flex; justify-content: space-between; align-items: center; }
.np-cardnote { margin: -8px 0 12px; }
.np-linkbtn { background: none; border: none; color: #7fb0d9; cursor: pointer; font-size: 13px; padding: 0; }
.np-linkbtn:hover { text-decoration: underline; }

.np-field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.np-field:last-child { margin-bottom: 0; }
.np-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; }
@media (max-width: 620px) { .np-grid2 { grid-template-columns: 1fr; } }
.np-label { font-size: 13px; color: #ddd; font-weight: 500; }
.np-hint { color: #666; font-weight: 400; font-size: 11px; margin-left: 6px; }
.np-req { color: #d98c2b; font-weight: 400; font-size: 11px; margin-left: 6px; }
.np-sublabel { font-size: 11px; color: #777; line-height: 1.4; }
.np-input, .np-textarea { background: #14141a; color: #eee; border: 1px solid #333; border-radius: 6px; padding: 9px 11px; font-size: 13px; width: 100%; box-sizing: border-box; }
.np-input:focus, .np-textarea:focus { outline: none; border-color: #4d9e39; }
.np-textarea { resize: vertical; line-height: 1.5; font-family: inherit; }
.mono { font-family: ui-monospace, monospace; }

.np-toggle { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 8px 0; border-bottom: 1px solid #242428; }
.np-toggle:last-of-type { border-bottom: none; }
.np-toggle > span { display: flex; flex-direction: column; gap: 3px; }
.np-toggle input { width: 20px; height: 20px; accent-color: #4d9e39; flex-shrink: 0; }
.np-models { display: flex; flex-direction: column; gap: 4px; margin-top: 6px; }
.np-modelrow { margin-bottom: 8px; }

.np-rail { position: sticky; top: 16px; }
.np-summary { background: #161519; border: 1px solid #2a2a2e; border-radius: 10px; padding: 18px; }
.np-summary h3 { margin: 0 0 12px; font-size: 15px; color: #eee; }
.np-check { list-style: none; padding: 0; margin: 0 0 14px; font-size: 12px; color: #888; }
.np-check li { padding: 3px 0; }
.np-check li.ok { color: #7fd97f; }
.np-recap { border-top: 1px solid #242428; padding-top: 12px; margin-bottom: 14px; }
.np-recap-row { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; color: #aaa; padding: 3px 0; }
.np-recap-row .ellip { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.np-error { color: #ff8484; font-size: 12px; background: #2a1818; padding: 8px 10px; border-radius: 6px; margin: 0 0 12px; }
.np-deploy { width: 100%; background: #4d9e39; color: #fff; border: none; padding: 11px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 14px; }
.np-deploy:hover:not(:disabled) { background: #5cb947; }
.np-deploy:disabled { opacity: 0.45; cursor: default; }
.np-cancel { width: 100%; background: none; color: #888; border: none; padding: 9px; margin-top: 6px; cursor: pointer; font-size: 13px; }
.np-cancel:hover:not(:disabled) { color: #ccc; }
</style>
