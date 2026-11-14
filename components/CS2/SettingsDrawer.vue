<template>
  <Teleport to="body">
    <div v-if="open" class="cs2x-layer">
      <div class="cs2x-scrim cs2x-scrim--side" @pointerdown.self="emit('close')">
        <aside class="cs2x-drawer" role="dialog" aria-modal="true" aria-labelledby="cs2x-settings-title" data-testid="cs2x-settings" @keydown.esc.prevent="emit('close')">
          <header class="cs2x-drawer__head">
            <span class="cs2x-dialog__glyph"><CS2Icon name="settings" /></span>
            <div style="flex: 1">
              <h2 id="cs2x-settings-title" class="cs2x-dialog__title">Bot settings</h2>
              <p class="cs2x-dialog__sub">Applied by the bot within a minute; no restart needed.</p>
            </div>
            <button class="cs2x-iconbtn" aria-label="Close settings" @click="emit('close')"><CS2Icon name="x" /></button>
          </header>
          <div class="cs2x-drawer__body">
            <div v-if="loading" class="cs2x-empty">Loading settings…</div>
            <div v-else-if="error" class="cs2x-error"><CS2Icon name="alert" />{{ error }}</div>
            <div v-else-if="!groups.length" class="cs2x-empty">No CS2 settings exist yet; the bot creates them the first time it starts.</div>
            <template v-else>
              <section v-for="group in groups" :key="group.title">
                <h3 class="cs2x-sub" style="margin-top: 16px">{{ group.title }}</h3>
                <div v-for="row in group.rows" :key="row.setting.Name" class="cs2x-setting" :data-dirty="isDirty(row.setting) || undefined" :data-testid="`setting-${row.setting.Name}`">
                  <label :for="inputId(row.setting)" style="min-width: 0">
                    <span class="cs2x-setting__label">{{ row.meta.label }}</span>
                    <span class="cs2x-setting__help">{{ row.meta.help }}</span>
                  </label>
                  <div class="cs2x-setting__control">
                    <label v-if="row.setting.Type === 1" class="cs2x-switch">
                      <input :id="inputId(row.setting)" v-model="drafts[row.setting.Name]" type="checkbox">
                      <span aria-hidden="true"></span>
                    </label>
                    <template v-else>
                      <span v-if="row.meta.prefix" class="cs2x-affix">{{ row.meta.prefix }}</span>
                      <input :id="inputId(row.setting)" v-model="drafts[row.setting.Name]" class="cs2x-input" :type="row.setting.Type === 2 ? 'number' : 'text'" :min="row.meta.min" :step="row.meta.step ?? 1" @keydown.enter.prevent="save(row.setting)">
                      <span v-if="row.meta.suffix" class="cs2x-affix">{{ row.meta.suffix }}</span>
                    </template>
                    <button class="cs2x-btn cs2x-btn--xs" :class="{ 'cs2x-btn--primary': isDirty(row.setting) }" :disabled="!isDirty(row.setting) || saving[row.setting.Name]" @click="save(row.setting)">
                      {{ saving[row.setting.Name] ? 'Saving' : 'Save' }}
                    </button>
                  </div>
                </div>
              </section>
            </template>
          </div>
          <footer v-if="message" class="cs2x-card__foot" :style="{ color: messageIsError ? 'var(--x-crit)' : 'var(--x-ok)' }">{{ message }}</footer>
        </aside>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import CS2Icon from '~/components/CS2/Icon.vue';
import { RequestGETFromKliveAPI, RequestPOSTFromKliveAPI } from '~/scripts/APIInterface';
import { CS2_HIDDEN_SETTINGS, CS2_SETTINGS, CS2_SETTING_GROUPS, type Cs2SettingMeta } from '~/scripts/cs2Arbitrage';

interface OmniSetting { Name: string; Type: number; Sensitive: boolean; Value: string; ParentServiceName: string; ParentServiceId: string }

const props = defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const settings = ref<OmniSetting[]>([]);
const drafts = reactive<Record<string, any>>({});
const saving = reactive<Record<string, boolean>>({});
const loading = ref(false);
const error = ref('');
const message = ref('');
const messageIsError = ref(false);

const inputId = (s: OmniSetting) => `cs2x-setting-${s.Name}`;
const asDraft = (s: OmniSetting) => (s.Type === 1 ? String(s.Value).toLowerCase() === 'true' : s.Value);
const isDirty = (s: OmniSetting) => String(drafts[s.Name]) !== String(asDraft(s));
const metaOf = (s: OmniSetting): Cs2SettingMeta => CS2_SETTINGS[s.Name] ?? { group: 'Pacing & model', order: 99, label: s.Name, help: 'Setting added by a newer bot build.' };

const groups = computed(() => {
  const rows = settings.value.map((setting) => ({ setting, meta: metaOf(setting) }));
  return CS2_SETTING_GROUPS
    .map((title) => ({ title, rows: rows.filter((r) => r.meta.group === title).sort((a, b) => a.meta.order - b.meta.order) }))
    .filter((g) => g.rows.length);
});

async function load() {
  loading.value = true;
  error.value = '';
  message.value = '';
  try {
    const response = await RequestGETFromKliveAPI('/OmniGlobalSettings/List', false, false);
    if (!response.ok) {
      error.value = response.status === 403 ? 'Only Klives can change bot settings.' : `Couldn't load settings (HTTP ${response.status}).`;
      return;
    }
    const all: OmniSetting[] = await response.json();
    settings.value = all.filter((s) => s.ParentServiceName === 'CS2ArbitrageBot' && !s.Sensitive && !CS2_HIDDEN_SETTINGS.has(s.Name));
    for (const s of settings.value) drafts[s.Name] = asDraft(s);
  } catch {
    error.value = "Couldn't load settings.";
  } finally {
    loading.value = false;
  }
}

async function save(setting: OmniSetting) {
  if (!isDirty(setting)) return;
  const raw = drafts[setting.Name];
  let value: string;
  if (setting.Type === 1) value = raw ? 'true' : 'false';
  else if (setting.Type === 2) {
    const n = Number(raw);
    if (!Number.isInteger(n)) {
      message.value = `${metaOf(setting).label} must be a whole number.`;
      messageIsError.value = true;
      return;
    }
    const min = metaOf(setting).min;
    if (min != null && n < min) {
      message.value = `${metaOf(setting).label} can't be below ${min}.`;
      messageIsError.value = true;
      return;
    }
    value = String(n);
  } else value = String(raw ?? '');
  saving[setting.Name] = true;
  try {
    const response = await RequestPOSTFromKliveAPI('/OmniGlobalSettings/Set', JSON.stringify({
      name: setting.Name, value, parentServiceId: setting.ParentServiceId, parentServiceName: setting.ParentServiceName,
    }), false, true);
    if (response.ok) {
      setting.Value = value;
      drafts[setting.Name] = asDraft(setting);
      message.value = `Saved: ${metaOf(setting).label}.`;
      messageIsError.value = false;
      emit('saved');
    } else {
      message.value = `Save failed (HTTP ${response.status}).`;
      messageIsError.value = true;
    }
  } catch {
    message.value = 'Save failed.';
    messageIsError.value = true;
  } finally {
    saving[setting.Name] = false;
  }
}

watch(() => props.open, (open) => { if (open) load(); }, { immediate: true });
</script>
