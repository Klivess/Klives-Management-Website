<template>
  <div class="settings-panel">
    <div v-if="loading" class="sp-info">Loading settings…</div>
    <template v-else>
      <p class="sp-note">{{ system
        ? 'System defaults — the settings every NEW project inherits. Changing these never affects existing projects.'
        : 'Per-project settings — this project\'s own configuration, independent of every other project.' }}</p>

      <section class="sp-group">
        <h4>Model routing</h4>
        <label v-for="f in modelFields" :key="f.key" class="sp-row">
          <span class="sp-label">{{ f.label }}</span>
          <input v-model="form[f.key]" class="sp-input" :placeholder="f.placeholder" />
        </label>
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

      <div class="sp-actions">
        <button class="sp-save" :disabled="saving || !dirty" @click="save">{{ saving ? 'Saving…' : (dirty ? 'Save changes' : 'Saved') }}</button>
        <button class="sp-reset" :disabled="!dirty" @click="reset">Reset</button>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';

// `system` mode edits the system-wide defaults new projects inherit (no projectId needed);
// otherwise it edits one project's own settings.
const props = defineProps<{ projectId?: string; system?: boolean }>();

const getUrl = () => props.system
  ? '/projects/system/settings'
  : `/projects/settings?projectID=${props.projectId}`;
const updateUrl = () => props.system ? '/projects/system/settings/update' : '/projects/settings/update';
const updateBody = (patch: Record<string, string>) => props.system
  ? JSON.stringify(patch)
  : JSON.stringify({ projectID: props.projectId, ...patch });

const loading = ref(true);
const saving = ref(false);
const original = ref<Record<string, any>>({});
const form = reactive<Record<string, any>>({});

const modelFields = [
  { key: 'commanderModel', label: 'Commander', placeholder: 'anthropic/claude-sonnet-4.5' },
  { key: 'utilityModel', label: 'Utility (digests/reports)', placeholder: 'openai/gpt-4.1-mini' },
  { key: 'tierTextModel', label: 'Tier: Text', placeholder: 'openai/gpt-4.1-mini' },
  { key: 'tierTextImageModel', label: 'Tier: Text+Image', placeholder: 'openai/gpt-4.1' },
  { key: 'tierTextImageVideoModel', label: 'Tier: +Video', placeholder: 'anthropic/claude-sonnet-4.5' },
  { key: 'tierTextImageVideoAudioModel', label: 'Tier: +Audio', placeholder: 'google/gemini-2.5-pro' },
  { key: 'stimulusFreeModel', label: 'Triage (free)', placeholder: 'openai/gpt-4.1-mini' },
  { key: 'stimulusFallbackModel', label: 'Triage (fallback)', placeholder: 'openai/gpt-4.1-mini' },
];

const EDITABLE = [...modelFields.map(f => f.key), 'visionEnabled', 'containersEnabled', 'desktopImage'];

const dirty = computed(() => EDITABLE.some(k => form[k] !== original.value[k]));

async function load() {
  loading.value = true;
  try {
    const res = await RequestGETFromKliveAPI(getUrl(), false, false);
    if (res.ok) {
      const s = await res.json();
      for (const k of EDITABLE) form[k] = s[k];
      original.value = { ...form };
    }
  } catch { /* transient */ }
  finally { loading.value = false; }
}

function reset() { for (const k of EDITABLE) form[k] = original.value[k]; }

async function save() {
  saving.value = true;
  try {
    // Only send changed keys; booleans go as string per the backend's TrySet parser.
    const patch: Record<string, string> = {};
    for (const k of EDITABLE) if (form[k] !== original.value[k]) patch[k] = String(form[k]);
    const res = await RequestPOSTFromKliveAPI(updateUrl(), updateBody(patch), false, true);
    if (res.ok) original.value = { ...form };
  } finally { saving.value = false; }
}

onMounted(load);
</script>

<style scoped>
.settings-panel { padding: 4px 2px; }
.sp-note { font-size: 12px; color: #888; margin: 0 0 16px; }
.sp-group { margin-bottom: 20px; }
.sp-group h4 { margin: 0 0 10px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #7fb0d9; }
.sp-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.sp-label { font-size: 13px; color: #ccc; display: flex; flex-direction: column; }
.sp-hint { font-size: 11px; color: #666; font-weight: 400; }
.sp-input { flex: 1; max-width: 320px; background: #14141a; color: #eee; border: 1px solid #333; border-radius: 6px; padding: 8px 10px; font-size: 13px; font-family: ui-monospace, monospace; }
.sp-input:focus { outline: none; border-color: #4d9e39; }
.sp-toggle input { width: 18px; height: 18px; accent-color: #4d9e39; }
.sp-actions { display: flex; gap: 8px; margin-top: 8px; }
.sp-save { background: #4d9e39; color: #fff; border: none; padding: 9px 18px; border-radius: 6px; cursor: pointer; font-weight: 600; }
.sp-save:disabled { opacity: 0.5; cursor: default; }
.sp-reset { background: #26262b; color: #ccc; border: none; padding: 9px 16px; border-radius: 6px; cursor: pointer; }
.sp-reset:disabled { opacity: 0.4; cursor: default; }
.sp-info { color: #888; padding: 20px; text-align: center; }
</style>
