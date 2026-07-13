<template>
  <div class="settings-panel">
    <div v-if="loading" class="sp-info">Loading settings…</div>
    <template v-else>
      <p class="sp-note">{{ system
        ? 'System defaults — the settings every NEW project inherits. Changing these never affects existing projects.'
        : 'Per-project settings — this project\'s own configuration, independent of every other project.' }}</p>

      <section class="sp-group">
        <h4>Model routing</h4>
        <p class="sp-route-note">Each list is isolated. The first route is preferred; failures advance downward in exactly this order.</p>
        <ModelRouteList
          v-for="f in modelFields"
          :key="f.key"
          v-model="form[f.key]"
          :label="f.label"
          :placeholder="f.placeholder"
        />
      </section>

      <section class="sp-group">
        <h4>Behaviour</h4>
        <label class="sp-row sp-toggle">
          <span class="sp-label">Vision enabled<span class="sp-hint">feed screenshots back to video-tier agents</span></span>
          <input type="checkbox" v-model="form.visionEnabled" />
        </label>
        <label class="sp-row sp-toggle">
          <span class="sp-label">Containers enabled<span class="sp-hint">allow desktop containers (text-only project: off)</span></span>
          <input type="checkbox" v-model="form.containersEnabled" />
        </label>
        <label class="sp-row">
          <span class="sp-label">Desktop image</span>
          <input v-model="form.desktopImage" class="sp-input" placeholder="omnipotent/projects-desktop:latest" />
        </label>
      </section>

      <p v-if="invalidRoutes" class="sp-error">Every route entry must contain a provider/model value.</p>
      <div class="sp-actions">
        <button class="sp-save" :disabled="saving || !dirty || invalidRoutes" @click="save">{{ saving ? 'Saving…' : (dirty ? 'Save changes' : 'Saved') }}</button>
        <button class="sp-reset" :disabled="!dirty" @click="reset">Reset</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import ModelRouteList from './ModelRouteList.vue';

const props = defineProps<{ projectId?: string; system?: boolean }>();
const getUrl = () => props.system ? '/projects/system/settings' : `/projects/settings?projectID=${props.projectId}`;
const updateUrl = () => props.system ? '/projects/system/settings/update' : '/projects/settings/update';
const updateBody = (patch: Record<string, any>) => JSON.stringify(props.system ? patch : { projectID: props.projectId, ...patch });

const loading = ref(true);
const saving = ref(false);
const original = ref<Record<string, any>>({});
const form = reactive<Record<string, any>>({});

const modelFields = [
  { key: 'commanderRoutes', legacy: 'commanderModel', label: 'Commander', placeholder: 'anthropic/claude-sonnet-4.5' },
  { key: 'utilityRoutes', legacy: 'utilityModel', label: 'Utility (digests/reports)', placeholder: 'openai/gpt-4.1-mini' },
  { key: 'councilRoutes', legacy: 'councilModel', label: 'Council', placeholder: 'anthropic/claude-sonnet-4.5' },
  { key: 'tierTextRoutes', legacy: 'tierTextModel', label: 'Tier: Text', placeholder: 'openai/gpt-4.1-mini' },
  { key: 'tierTextImageRoutes', legacy: 'tierTextImageModel', label: 'Tier: Text+Image', placeholder: 'openai/gpt-4.1' },
  { key: 'tierTextImageVideoRoutes', legacy: 'tierTextImageVideoModel', label: 'Tier: +Video', placeholder: 'anthropic/claude-sonnet-4.5' },
  { key: 'tierTextImageVideoAudioRoutes', legacy: 'tierTextImageVideoAudioModel', label: 'Tier: +Audio', placeholder: 'google/gemini-2.5-pro' },
  { key: 'stimulusFreeRoutes', legacy: 'stimulusFreeModel', label: 'Triage (free)', placeholder: 'openai/gpt-4.1-mini' },
  { key: 'stimulusFallbackRoutes', legacy: 'stimulusFallbackModel', label: 'Triage (fallback)', placeholder: 'openai/gpt-4.1-mini' },
];
for (const f of modelFields) form[f.key] = [''];
form.visionEnabled = true;
form.containersEnabled = true;
form.desktopImage = 'omnipotent/projects-desktop:latest';
const EDITABLE = [...modelFields.map(f => f.key), 'visionEnabled', 'containersEnabled', 'desktopImage'];
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
const invalidRoutes = computed(() => modelFields.some(f =>
  !Array.isArray(form[f.key]) || form[f.key].length === 0 || form[f.key].some((r: string) => !r.trim())));

function applySettings(s: Record<string, any>) {
  for (const f of modelFields) form[f.key] = cleanRoutes(s[f.key], s[f.legacy]);
  for (const k of ['visionEnabled', 'containersEnabled', 'desktopImage']) form[k] = s[k];
}

async function load() {
  loading.value = true;
  try {
    const res = await RequestGETFromKliveAPI(getUrl(), false, false);
    if (res.ok) {
      applySettings(await res.json());
      original.value = clone(form);
    }
  } catch { /* transient */ }
  finally { loading.value = false; }
}

function reset() { for (const k of EDITABLE) form[k] = clone(original.value[k]); }

async function save() {
  if (invalidRoutes.value) return;
  saving.value = true;
  try {
    const patch: Record<string, any> = {};
    for (const k of EDITABLE) if (!same(form[k], original.value[k]))
      patch[k] = k.endsWith('Routes') ? cleanRoutes(form[k]) : form[k];
    const res = await RequestPOSTFromKliveAPI(updateUrl(), updateBody(patch), false, true);
    if (res.ok) {
      const body = await res.json();
      applySettings(body.settings ?? form);
      original.value = clone(form);
    }
  } finally { saving.value = false; }
}

onMounted(load);
</script>

<style scoped>
.settings-panel { padding: 4px 2px; }
.sp-note, .sp-route-note { font-size: 12px; color: #888; margin: 0 0 16px; }
.sp-route-note { margin: -4px 0 6px; color: #737373; }
.sp-group { margin-bottom: 20px; }
.sp-group h4 { margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #7fb0d9; }
.sp-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.sp-label { font-size: 13px; color: #ccc; display: flex; flex-direction: column; }
.sp-hint { font-size: 11px; color: #666; font-weight: 400; }
.sp-input { flex: 1; max-width: 320px; background: #14141a; color: #eee; border: 1px solid #333; border-radius: 6px; padding: 8px 10px; font-size: 13px; font-family: ui-monospace, monospace; }
.sp-input:focus { outline: none; border-color: #4d9e39; }
.sp-toggle input { width: 18px; height: 18px; accent-color: #4d9e39; }
.sp-error { color: #ff9a8c; font-size: 11px; margin: 0 0 8px; }
.sp-actions { display: flex; gap: 8px; margin-top: 8px; }
.sp-save { background: #4d9e39; color: #fff; border: none; padding: 9px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; }
.sp-save:disabled { opacity: 0.5; cursor: default; }
.sp-reset { background: #26262b; color: #ccc; border: none; padding: 9px 16px; border-radius: 6px; cursor: pointer; }
.sp-reset:disabled { opacity: 0.4; cursor: default; }
.sp-info { color: #888; padding: 20px; text-align: center; }
</style>
